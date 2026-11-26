"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import { setUserPassword } from "@flagstage/auth";
import {
  acceptInvitation,
  can,
  createAccount,
  getImporterSettings,
  hasAnyAccess,
  loadGrants,
  slugify,
  updateEditSettings,
  updateImporterSettings,
  type Action,
  type Principal
} from "@flagstage/core";
import { importRun, message, site, thread, user } from "@flagstage/db";
import { sendEmail } from "@flagstage/forms";
import { approveImport, getImporter } from "@flagstage/importer";
import { startImport, startTurn } from "./dispatch";
import { createBlobStore, publicPrefixFor } from "@flagstage/storage";
import {
  approveChange,
  buildAgentEnv,
  skillsDirectory,
  subprocessRunner,
  undoEdit
} from "@flagstage/agent";
import {
  disarmSchedule,
  insertSchedule,
  invalidatePublishedKeys,
  localInputToUtc,
  publishRedirects,
  redirectEdge,
  rollbackTo
} from "@flagstage/publish";
import { siteSchedule } from "@flagstage/db";
import { account, siteDomain, siteMembership, snapshot } from "@flagstage/db";
import {
  checkDnsRecords,
  cloudfrontKeyValueStore,
  domainStatus,
  isValidHostname,
  normalizeHostname,
  publicDnsLookup,
  selectDomainsDriver,
  writeHostPrefix,
  type DnsRecord
} from "@flagstage/domains";

import { ACCOUNT_COOKIE, SITE_COOKIE } from "./account-cookie";
import { getAuth } from "./auth";
import { applyAuthResponse } from "./cookies";
import { database, landingPath, requirePrincipal } from "./guard";
import { installedImporters } from "./installed-importers";
import { publishDraftFor } from "./publish-draft";
import { ownerChoices } from "./roster";

async function allowedSite(principal: Principal, siteId: string, action: Action) {
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found || !can(principal, action, { accountId: found.accountId, siteId: found.id })) {
    return null;
  }
  return found;
}

async function deliver(to: string, subject: string, text: string) {
  const config = loadConfig();
  const region = config.product?.region ?? config.S3_REGION;
  if (!config.MAIL_FROM || !region) return;
  await sendEmail({ region, from: config.MAIL_FROM, to: [to], subject, text }).catch(
    () => undefined
  );
}

function appUrl() {
  return loadConfig().APP_URL;
}

async function accountSlugFor(accountId: string) {
  const rows = await database()
    .select({ slug: account.slug })
    .from(account)
    .where(eq(account.id, accountId))
    .limit(1);
  return rows[0]?.slug;
}

async function siteHref(siteId: string, rest = "") {
  const rows = await database()
    .select({ accountId: site.accountId })
    .from(site)
    .where(eq(site.id, siteId))
    .limit(1);
  const accountId = rows[0]?.accountId;
  if (!accountId) return "/";
  const slug = await accountSlugFor(accountId);
  if (!slug) return "/";
  return `/a/${slug}/sites/${siteId}${rest}`;
}

function liveHost(slug: string) {
  const config = loadConfig();
  const domain = config.NODE_ENV === "production" ? config.product?.domain : undefined;
  return domain ? `${slug}.${domain}` : `${slug}.localhost`;
}

async function publishHostMap(host: string | undefined, prefix: string | undefined) {
  if (!host || !prefix) return;
  const config = loadConfig();
  if (config.HOSTMAP_DRIVER !== "cloudfront-kvs" || !config.CLOUDFRONT_KVS_ARN) return;
  await writeHostPrefix(cloudfrontKeyValueStore(config.CLOUDFRONT_KVS_ARN), host, prefix);
}

async function publishEdgeRedirects(siteId: string, host: string) {
  const edge = redirectEdge(loadConfig());
  if (!edge.store) return;
  await publishRedirects({ db: database(), siteId, host, store: edge.store });
}

async function invalidateLive(fromPrefix: string | null | undefined, toPrefix: string | undefined) {
  if (!toPrefix) return;
  const config = loadConfig();
  await invalidatePublishedKeys({
    store: createBlobStore(config),
    distributionId: config.CLOUDFRONT_DISTRIBUTION_ID,
    fromPrefix,
    toPrefix
  });
}

function nextPath(formData: FormData, fallback: string) {
  const next = String(formData.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//") && !next.includes("://")) return next;
  return fallback;
}

function failTo(formData: FormData, fallback: string, code = "1"): never {
  const next = nextPath(formData, fallback);
  const url = new URL(next, "http://local");
  url.searchParams.set("error", code);
  redirect(`${url.pathname}${url.search}`);
}

export async function signInWithPassword(formData: FormData) {
  const response = await getAuth().handler(
    new Request(`${appUrl()}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(appUrl()).origin },
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? "")
      })
    })
  );
  await applyAuthResponse(response);
  if (!response.ok) redirect("/sign-in?error=1");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const people = await database().select().from(user).where(eq(user.email, email)).limit(1);
  const person = people[0];
  if (!person) redirect("/sign-in?error=1");
  const grants = await loadGrants(database(), person.id);
  const principal = {
    id: person.id,
    orgRole: grants.orgRole,
    disabled: grants.disabled,
    memberships: grants.memberships,
    siteGrants: grants.siteGrants
  };
  if (!hasAnyAccess(principal)) redirect("/no-access");
  redirect(await landingPath(principal));
}

export async function signOut() {
  const jar = await cookies();
  const clear = { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" as const };
  jar.set(ACCOUNT_COOKIE, "", clear);
  jar.set(SITE_COOKIE, "", clear);
  const response = await getAuth().handler(
    new Request(`${appUrl()}/api/auth/sign-out`, {
      method: "POST",
      headers: { origin: new URL(appUrl()).origin }
    })
  );
  await applyAuthResponse(response);
  redirect("/sign-in");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  try {
    const reset = await setUserPassword(database(), { email });
    await deliver(reset.email, "Your new password", `Your new password is ${reset.password}`);
  } catch {
    // The response is the same when the address is unknown.
  }
  redirect("/sign-in?reset=1");
}

export async function createAccountAction(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) failTo(formData, "/admin/accounts");
  const created = await createAccount(database(), name);
  redirect(nextPath(formData, `/a/${created.slug}/sites`));
}

export async function acceptInviteAction(formData: FormData) {
  const principal = await requirePrincipal();
  const invite = await acceptInvitation(
    database(),
    String(formData.get("token") ?? ""),
    principal.id,
    principal.email
  );
  const slug = await accountSlugFor(invite.accountId);
  redirect(slug ? `/a/${slug}/sites` : await landingPath(principal));
}

export async function setOrgRoleAction(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || (role !== "admin" && role !== "none")) redirect("/admin");
  if (userId === principal.id && role !== "admin") redirect("/admin?error=self");
  const db = database();
  if (role === "none") {
    const admins = await db.select({ id: user.id }).from(user).where(eq(user.org_role, "admin"));
    if (admins.length < 2 && admins.some((row) => row.id === userId)) redirect("/admin?error=self");
  }
  await db
    .update(user)
    .set({ org_role: role, org_role_source: "manual", updatedAt: new Date() })
    .where(eq(user.id, userId));
  redirect("/admin");
}

export async function importSiteAction(formData: FormData) {
  const principal = await requirePrincipal();
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "site.manage", { accountId })) redirect("/no-access");
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const ownerId = String(formData.get("owner") ?? "");
  const choices = await ownerChoices(database(), accountId, principal);
  const owner = choices.find((person) => person.id === ownerId);
  const accountSlug = await accountSlugFor(accountId);
  const sitesPath = accountSlug ? `/a/${accountSlug}/sites` : "/";
  if (!sourceUrl || !name || !owner) redirect(`${sitesPath}?error=1`);
  if (source) {
    try {
      getImporter(source);
    } catch {
      redirect(`${sitesPath}?error=1`);
    }
  }
  const db = database();
  const siteId = randomUUID();
  const runId = randomUUID();
  const requested = String(formData.get("timeZone") ?? "").trim();
  let timeZone = "UTC";
  if (requested) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: requested });
      timeZone = requested;
    } catch {
      timeZone = "UTC";
    }
  }
  await db.insert(site).values({
    id: siteId,
    accountId,
    name,
    slug: slugify(name),
    sourceUrl,
    status: "importing",
    timeZone
  });
  await db.insert(siteMembership).values({
    id: randomUUID(),
    siteId,
    userId: owner.id,
    role: "owner"
  });
  await db.insert(importRun).values({
    id: runId,
    siteId,
    sourceUrl,
    status: "queued",
    options: source ? { source } : {}
  });
  try {
    await startImport({ siteId, runId, sourceUrl, source: source || undefined });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Import failed";
    await db
      .update(importRun)
      .set({ status: "failed", error: messageText, updatedAt: new Date() })
      .where(eq(importRun.id, runId));
    await db.update(site).set({ status: "failed" }).where(eq(site.id, siteId));
    redirect(`${sitesPath}?error=1`);
  }
  redirect(accountSlug ? `/a/${accountSlug}/sites/${siteId}` : sitesPath);
}

export async function approveSiteAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const snapshotId = String(formData.get("snapshotId") ?? "");
  const db = database();
  const found = await allowedSite(principal, siteId, "site.publish");
  if (!found) redirect("/no-access");
  const config = loadConfig();
  await publishEdgeRedirects(siteId, liveHost(found.slug));
  const before = found.currentSnapshotId
    ? await db.select().from(snapshot).where(eq(snapshot.id, found.currentSnapshotId)).limit(1)
    : [];
  const published = await approveImport({
    db,
    store: createBlobStore(config),
    siteId,
    snapshotId,
    host: liveHost(found.slug),
    hostMapPath: `${config.FS_STORAGE_DIR}/hostmap.json`
  });
  if (!published.ok) redirect(await siteHref(siteId, "/edit"));
  await publishHostMap(liveHost(found.slug), published.publicPrefix);
  const target = await db.select().from(snapshot).where(eq(snapshot.id, snapshotId)).limit(1);
  await invalidateLive(before[0]?.storagePrefix, target[0]?.storagePrefix);
  redirect(nextPath(formData, await siteHref(siteId)));
}

function editor() {
  const config = loadConfig();
  const region = process.env.AWS_REGION ?? config.product?.region ?? config.S3_REGION;
  return subprocessRunner({
    env: buildAgentEnv({
      ...process.env,
      AWS_REGION: region,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? region,
      AGENT_MODEL: config.AGENT_MODEL,
      AI_MODEL_SMALL: config.AI_MODEL_SMALL
    }),
    timeoutMs: config.AGENT_TIMEOUT_SEC * 1000,
    skillsDir: skillsDirectory
  });
}

export async function sendMessageAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const foundSite = rows[0];
  if (!foundSite) redirect("/no-access");
  const scope = { accountId: foundSite.accountId, siteId: foundSite.id };
  const canEdit = can(principal, "site.edit", scope);
  const canComment = can(principal, "site.comment", scope);
  if (!canComment && !canEdit) redirect("/no-access");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(nextPath(formData, await siteHref(siteId, "/edit")));
  const db = database();
  const existing = await db.select().from(thread).where(eq(thread.siteId, siteId)).limit(1);
  const threadId = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
    await db.insert(thread).values({
      id: threadId,
      siteId,
      title: "Changes",
      createdBy: principal.id,
      status: canEdit ? "queued" : "open"
    });
  } else if (canEdit) {
    await db
      .update(thread)
      .set({ status: "queued", updatedAt: new Date() })
      .where(eq(thread.id, threadId));
  }
  await db.insert(message).values({
    id: randomUUID(),
    threadId,
    author: "user",
    userId: principal.id,
    body
  });
  if (canEdit) {
    try {
      await startTurn({ siteId, userId: principal.id, body });
    } catch {
      await db
        .update(thread)
        .set({ status: "open", updatedAt: new Date() })
        .where(eq(thread.id, threadId));
      redirect(`${nextPath(formData, await siteHref(siteId, "/edit"))}?error=1`);
    }
  }
  redirect(nextPath(formData, await siteHref(siteId, "/edit")));
}

export async function approveChangeAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const found = await allowedSite(principal, siteId, "site.publish");
  if (!found) redirect("/no-access");
  const config = loadConfig();
  await publishEdgeRedirects(siteId, liveHost(found.slug));
  const published = await approveChange({
    db: database(),
    store: createBlobStore(config),
    changeRequestId: String(formData.get("changeRequestId") ?? ""),
    actorUserId: principal.id,
    host: found ? liveHost(found.slug) : undefined,
    hostMapPath: `${config.FS_STORAGE_DIR}/hostmap.json`,
    runner: editor(),
    appOrigin: config.APP_URL
  });
  if (published.ok) {
    await publishHostMap(liveHost(found.slug), published.publicPrefix);
    await invalidateLive(published.fromPrefix, published.storagePrefix);
  }
  redirect(nextPath(formData, await siteHref(siteId)));
}

export async function publishDraftAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const result = await publishDraftFor({
    principal,
    siteId,
    snapshotId: String(formData.get("snapshotId") ?? "")
  });
  if (result === "denied") redirect("/no-access");
  if (result === "failed") redirect(`${await siteHref(siteId)}?error=1`);
  redirect(nextPath(formData, await siteHref(siteId)));
}

export async function schedulePublishAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  if (!(await allowedSite(principal, siteId, "site.publish"))) redirect("/no-access");
  const found = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const zone = found[0]?.timeZone || "UTC";
  const publish = localInputToUtc(String(formData.get("publishAt") ?? ""), zone);
  const revertRaw = String(formData.get("revertAt") ?? "");
  const revert = revertRaw ? localInputToUtc(revertRaw, zone) : null;
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!publish || !snapshotId) redirect(`${await siteHref(siteId)}?error=1`);
  if (revert && revert.date.getTime() <= publish.date.getTime()) {
    redirect(`${await siteHref(siteId)}?error=1`);
  }
  await insertSchedule(database(), {
    siteId,
    snapshotId,
    publishAt: publish.date,
    revertAt: revert?.date ?? null,
    actorUserId: principal.id,
    summary: "Scheduled from the builder",
    timeZone: zone
  });
  redirect(await siteHref(siteId, "/scheduled"));
}

export async function cancelScheduleAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  if (!(await allowedSite(principal, siteId, "site.publish"))) redirect("/no-access");
  const id = String(formData.get("scheduleId") ?? "");
  await disarmSchedule(id, "publish").catch(() => undefined);
  await disarmSchedule(id, "revert").catch(() => undefined);
  await database()
    .update(siteSchedule)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(siteSchedule.id, id));
  redirect(await siteHref(siteId, "/scheduled"));
}

export async function rescheduleAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  if (!(await allowedSite(principal, siteId, "site.publish"))) redirect("/no-access");
  const id = String(formData.get("scheduleId") ?? "");
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const zone = rows[0]?.timeZone || "UTC";
  const publish = localInputToUtc(String(formData.get("publishAt") ?? ""), zone);
  if (!publish) redirect(`${await siteHref(siteId, "/scheduled")}?error=1`);
  const revertRaw = String(formData.get("revertAt") ?? "");
  const revert = revertRaw ? localInputToUtc(revertRaw, zone) : null;
  await database()
    .update(siteSchedule)
    .set({
      publishAt: publish.date,
      revertAt: revert?.date ?? null,
      status: "scheduled",
      updatedAt: new Date()
    })
    .where(eq(siteSchedule.id, id));
  const { armSchedule } = await import("@flagstage/publish");
  await armSchedule(id, publish.date, "publish").catch(() => undefined);
  if (revert) await armSchedule(id, revert.date, "revert").catch(() => undefined);
  redirect(await siteHref(siteId, "/scheduled"));
}

export async function updateSiteTimeZoneAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  if (!(await allowedSite(principal, siteId, "site.manage"))) redirect("/no-access");
  const requested = String(formData.get("timeZone") ?? "").trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: requested });
  } catch {
    redirect(`${await siteHref(siteId, "/settings")}?error=1`);
  }
  await database().update(site).set({ timeZone: requested }).where(eq(site.id, siteId));
  redirect(await siteHref(siteId, "/settings"));
}

export async function rollbackAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const foundAccess = await allowedSite(principal, siteId, "site.publish");
  if (!foundAccess) redirect("/no-access");
  const snapshotId = String(formData.get("snapshotId") ?? "");
  const config = loadConfig();
  const db = database();
  const rows = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  const snaps = await db.select().from(snapshot).where(eq(snapshot.id, snapshotId)).limit(1);
  const store = createBlobStore(config);
  const fromRows = found?.currentSnapshotId
    ? await db.select().from(snapshot).where(eq(snapshot.id, found.currentSnapshotId)).limit(1)
    : [];
  const publicPrefix = snaps[0] ? await publicPrefixFor(store, snaps[0].storagePrefix) : undefined;
  const rolled = await rollbackTo({
    db,
    siteId,
    toSnapshotId: snapshotId,
    actorUserId: principal.id,
    host: found ? liveHost(found.slug) : undefined,
    hostMapPath: `${config.FS_STORAGE_DIR}/hostmap.json`,
    prefix: publicPrefix
  });
  if (rolled.ok) {
    await publishHostMap(found ? liveHost(found.slug) : undefined, publicPrefix);
    await invalidateLive(fromRows[0]?.storagePrefix, snaps[0]?.storagePrefix);
  }
  redirect(await siteHref(siteId));
}

export async function setBudgetAction(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect(await landingPath(principal));
  const accountId = String(formData.get("accountId") ?? "");
  const raw = String(formData.get("monthlyBudgetUsd") ?? "").trim();
  const monthlyBudgetUsd = raw === "" ? null : Number(raw);
  if (monthlyBudgetUsd != null && (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0)) {
    redirect(nextPath(formData, "/admin/usage"));
  }
  await database().update(account).set({ monthlyBudgetUsd }).where(eq(account.id, accountId));
  redirect(nextPath(formData, "/admin/usage"));
}

export async function undoEditAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  if (!(await allowedSite(principal, siteId, "site.edit"))) redirect("/no-access");
  await undoEdit(database(), siteId);
  redirect(nextPath(formData, await siteHref(siteId, "/edit")));
}

export async function addDomainAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  if (!(await allowedSite(principal, siteId, "domain.manage"))) redirect("/no-access");
  const config = loadConfig();
  const hostname = normalizeHostname(String(formData.get("hostname") ?? ""));
  if (!isValidHostname(hostname)) redirect(await siteHref(siteId, "/domain"));
  const driver = await selectDomainsDriver(config);
  const existing = await database()
    .select()
    .from(siteDomain)
    .where(eq(siteDomain.hostname, hostname))
    .limit(1);
  const current = existing[0];
  if (current && current.siteId !== siteId) redirect(await siteHref(siteId, "/domain"));
  const provisioned = current?.cloudfrontTenantId
    ? await driver.update(current.cloudfrontTenantId, hostname)
    : await driver.provision(hostname);
  if (current) {
    await database()
      .update(siteDomain)
      .set({
        records: provisioned.records,
        cloudfrontTenantId: provisioned.tenantId,
        status: "pending",
        lastCheckedAt: null
      })
      .where(eq(siteDomain.id, current.id));
  } else {
    await database().insert(siteDomain).values({
      id: randomUUID(),
      siteId,
      hostname,
      records: provisioned.records,
      cloudfrontTenantId: provisioned.tenantId,
      status: "pending"
    });
  }
  redirect(await siteHref(siteId, "/domain"));
}

export async function saveImporterSettingsAction(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const modelId = String(formData.get("decisionModel") ?? "").trim();
  const maxPages = Number(formData.get("maxPages"));
  const maxAssets = Number(formData.get("maxAssets"));
  try {
    await updateImporterSettings(database(), principal, {
      decisionModel: { provider: "bedrock", modelId },
      maxPages,
      maxAssets
    });
  } catch {
    redirect("/admin/settings/importer?error=1");
  }
  redirect("/admin/settings/importer");
}

export async function toggleImporterAction(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const id = String(formData.get("importer") ?? "").trim();
  if (!installedImporters().some((item) => item.id === id)) {
    redirect("/admin/settings/importer?error=1");
  }
  const db = database();
  const current = await getImporterSettings(db);
  const disabled = new Set(current.disabledImporters);
  if (disabled.has(id)) disabled.delete(id);
  else disabled.add(id);
  try {
    await updateImporterSettings(db, principal, { disabledImporters: [...disabled] });
  } catch {
    redirect("/admin/settings/importer?error=1");
  }
  redirect("/admin/settings/importer");
}

export async function saveEditSettingsAction(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const handEditPageLimit = Number(formData.get("handEditPageLimit"));
  try {
    await updateEditSettings(database(), principal, { handEditPageLimit });
  } catch {
    redirect("/admin/settings/editor?error=1");
  }
  redirect("/admin/settings/editor");
}

export async function recheckDomainAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  if (!(await allowedSite(principal, siteId, "domain.manage"))) redirect("/no-access");
  const domainId = String(formData.get("domainId") ?? "");
  const rows = await database()
    .select()
    .from(siteDomain)
    .where(eq(siteDomain.id, domainId))
    .limit(1);
  const found = rows[0];
  if (!found) redirect(await siteHref(siteId, "/domain"));
  const config = loadConfig();
  const driver = await selectDomainsDriver(config);
  const refreshed =
    found.cloudfrontTenantId && config.DOMAINS_DRIVER === "cloudfront-tenants"
      ? await driver.read(found.cloudfrontTenantId, found.hostname)
      : null;
  const records = await checkDnsRecords(
    (refreshed?.records ?? found.records) as DnsRecord[],
    publicDnsLookup()
  );
  const status = domainStatus(
    records,
    refreshed?.certificateStatus ?? null,
    refreshed?.distributionStatus ?? null
  );
  await database()
    .update(siteDomain)
    .set({ records, status, lastCheckedAt: new Date() })
    .where(eq(siteDomain.id, domainId));
  redirect(await siteHref(siteId, "/domain"));
}
