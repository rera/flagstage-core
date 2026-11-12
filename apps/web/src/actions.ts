"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import { setUserPassword } from "@flagstage/auth";
import { acceptInvitation, can, createAccount, createInvitation, slugify } from "@flagstage/core";
import { importRun, message, site, thread, user } from "@flagstage/db";
import { sendEmail } from "@flagstage/forms";
import { approveImport } from "@flagstage/importer";
import { startImport, startTurn } from "./dispatch";
import { createBlobStore, snapshotPrefix } from "@flagstage/storage";
import {
  approveChange,
  buildAgentEnv,
  skillsDirectory,
  subprocessRunner,
  undoEdit
} from "@flagstage/agent";
import { rollbackTo } from "@flagstage/publish";
import { account, siteDomain, snapshot } from "@flagstage/db";
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

import { getAuth } from "./auth";
import { applyAuthResponse } from "./cookies";
import { database, requirePrincipal } from "./guard";

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
  redirect("/accounts");
}

export async function signOut() {
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
  if (!name) failTo(formData, "/accounts");
  const created = await createAccount(database(), name);
  redirect(nextPath(formData, `/accounts/${created.id}`));
}

export async function inviteMember(
  _previous: { secret?: string; error?: string } | null,
  formData: FormData
) {
  const principal = await requirePrincipal();
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "member.manage", { accountId }))
    return { error: "You cannot invite members of this account." };
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) return { error: "Enter an email address." };
  const invite = await createInvitation(database(), {
    accountId,
    email,
    role: "account_admin"
  });
  const link = `${appUrl()}/invitations/${invite.token}`;
  await deliver(email, "You are invited", `Open this link to join the account:\n${link}`);
  return { secret: link };
}

export async function acceptInviteAction(formData: FormData) {
  const principal = await requirePrincipal();
  await acceptInvitation(
    database(),
    String(formData.get("token") ?? ""),
    principal.id,
    principal.email
  );
  redirect("/accounts");
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
  if (!sourceUrl || !name) redirect("/sites?error=1");
  const db = database();
  const siteId = randomUUID();
  const runId = randomUUID();
  await db.insert(site).values({
    id: siteId,
    accountId,
    name,
    slug: slugify(name),
    sourceUrl,
    status: "importing"
  });
  await db.insert(importRun).values({ id: runId, siteId, sourceUrl, status: "queued" });
  try {
    await startImport({ siteId, runId, sourceUrl });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Import failed";
    await db
      .update(importRun)
      .set({ status: "failed", error: messageText, updatedAt: new Date() })
      .where(eq(importRun.id, runId));
    await db.update(site).set({ status: "failed" }).where(eq(site.id, siteId));
    redirect("/sites?error=1");
  }
  redirect(`/sites/${siteId}`);
}

export async function approveSiteAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!can(principal, "site.publish", { accountId: String(formData.get("accountId") ?? "") })) {
    redirect("/no-access");
  }
  const config = loadConfig();
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found) redirect("/sites");
  await approveImport({
    db: database(),
    siteId,
    snapshotId,
    host: liveHost(found.slug),
    prefix: snapshotPrefix(siteId, snapshotId),
    hostMapPath: `${config.FS_STORAGE_DIR}/hostmap.json`
  });
  await publishHostMap(liveHost(found.slug), snapshotPrefix(siteId, snapshotId));
  redirect(`/sites/${siteId}`);
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
  const accountId = String(formData.get("accountId") ?? "");
  const canComment = can(principal, "site.comment", { accountId });
  const canEdit = can(principal, "site.edit", { accountId });
  if (!canComment && !canEdit) redirect("/no-access");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(`/sites/${siteId}`);
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
      redirect(`/sites/${siteId}?error=1`);
    }
  }
  redirect(`/sites/${siteId}`);
}

export async function approveChangeAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "site.publish", { accountId })) redirect("/no-access");
  const config = loadConfig();
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
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
  if (published.ok && found) {
    await publishHostMap(liveHost(found.slug), snapshotPrefix(siteId, published.snapshotId));
  }
  redirect(`/sites/${siteId}`);
}

export async function rollbackAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "site.publish", { accountId })) redirect("/no-access");
  const snapshotId = String(formData.get("snapshotId") ?? "");
  const config = loadConfig();
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  const snaps = await database()
    .select()
    .from(snapshot)
    .where(eq(snapshot.id, snapshotId))
    .limit(1);
  await rollbackTo({
    db: database(),
    siteId,
    toSnapshotId: snapshotId,
    actorUserId: principal.id,
    host: found ? liveHost(found.slug) : undefined,
    hostMapPath: `${config.FS_STORAGE_DIR}/hostmap.json`,
    prefix: snaps[0]?.storagePrefix
  });
  await publishHostMap(found ? liveHost(found.slug) : undefined, snaps[0]?.storagePrefix);
  redirect(`/sites/${siteId}`);
}

export async function setBudgetAction(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const accountId = String(formData.get("accountId") ?? "");
  const raw = String(formData.get("monthlyBudgetUsd") ?? "").trim();
  const monthlyBudgetUsd = raw === "" ? null : Number(raw);
  if (monthlyBudgetUsd != null && (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0)) {
    redirect("/admin/usage");
  }
  await database().update(account).set({ monthlyBudgetUsd }).where(eq(account.id, accountId));
  redirect("/admin/usage");
}

export async function undoEditAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "site.edit", { accountId })) redirect("/no-access");
  await undoEdit(database(), siteId);
  redirect(`/sites/${siteId}`);
}

export async function addDomainAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "domain.manage", { accountId })) redirect("/no-access");
  const config = loadConfig();
  const hostname = normalizeHostname(String(formData.get("hostname") ?? ""));
  if (!isValidHostname(hostname)) redirect(`/sites/${siteId}/domain`);
  const driver = await selectDomainsDriver(config);
  const existing = await database()
    .select()
    .from(siteDomain)
    .where(eq(siteDomain.hostname, hostname))
    .limit(1);
  const current = existing[0];
  if (current && current.siteId !== siteId) redirect(`/sites/${siteId}/domain`);
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
  redirect(`/sites/${siteId}/domain`);
}

export async function recheckDomainAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "domain.manage", { accountId })) redirect("/no-access");
  const domainId = String(formData.get("domainId") ?? "");
  const rows = await database()
    .select()
    .from(siteDomain)
    .where(eq(siteDomain.id, domainId))
    .limit(1);
  const found = rows[0];
  if (!found) redirect(`/sites/${siteId}/domain`);
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
  redirect(`/sites/${siteId}/domain`);
}
