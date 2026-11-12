"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import {
  acceptInvitation,
  can,
  createAccount,
  createInvitation,
  slugify,
  type MembershipRole
} from "@flagstage/core";
import { idpGroupMapping, importRun, message, orgSettings, site, thread } from "@flagstage/db";
import { approveImport } from "@flagstage/importer";
import { enqueue } from "@flagstage/jobs";
import { createBlobStore, snapshotPrefix } from "@flagstage/storage";
import { samlProviderConfig } from "@flagstage/auth";
import { probeModel, type ProbeCode } from "@flagstage/ai";
import { t } from "@flagstage/ui";
import { approveChange, buildAgentEnv, skillsDirectory, subprocessRunner } from "@flagstage/agent";
import { rollbackTo } from "@flagstage/publish";
import { changeRequest, siteDomain, snapshot } from "@flagstage/db";
import {
  checkDnsRecords,
  domainStatus,
  isValidHostname,
  normalizeHostname,
  publicDnsLookup,
  selectDomainsDriver,
  type DnsRecord
} from "@flagstage/domains";

import { getAuth } from "./auth";
import { applyAuthResponse } from "./cookies";
import { database, requirePrincipal } from "./guard";

const ROLES = new Set<MembershipRole>(["account_admin", "editor", "reviewer"]);
const LOGO_KEY = "brand/logo";
const LOGO_LIMIT = 1_000_000;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const MODEL_DETAIL: Record<
  ProbeCode,
  | "model.mock"
  | "model.noKey"
  | "model.bedrock"
  | "model.baseUrl"
  | "model.ok"
  | "model.rejected"
  | "model.unreachable"
> = {
  mock: "model.mock",
  "no-key": "model.noKey",
  bedrock: "model.bedrock",
  "needs-base-url": "model.baseUrl",
  ok: "model.ok",
  rejected: "model.rejected",
  unreachable: "model.unreachable"
};

function appUrl() {
  return loadConfig().APP_URL;
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

export async function signInWithSso(formData: FormData) {
  const response = await getAuth().handler(
    new Request(`${appUrl()}/api/auth/sign-in/sso`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(appUrl()).origin },
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        providerId: String(formData.get("providerId") ?? "") || undefined,
        callbackURL: `${appUrl()}/accounts`
      })
    })
  );
  await applyAuthResponse(response);
  if (!response.ok) redirect("/sign-in?error=1");
  const body = (await response.json()) as { url?: string };
  if (!body.url) redirect("/sign-in?error=1");
  redirect(body.url);
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

export async function saveOrganization(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const name = String(formData.get("name") ?? "").trim();
  const baseDomain = String(formData.get("baseDomain") ?? "").trim();
  if (!name || !baseDomain) failTo(formData, "/setup?step=org");
  const logo = formData.get("logo");
  let logoUrl: string | undefined;
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.has(logo.type) || logo.size > LOGO_LIMIT) failTo(formData, "/setup?step=org");
    await createBlobStore(loadConfig()).put(
      LOGO_KEY,
      new Uint8Array(await logo.arrayBuffer()),
      logo.type
    );
    logoUrl = "/brand/logo";
  }
  await database()
    .update(orgSettings)
    .set({
      name,
      baseDomain,
      previewDomain: baseDomain,
      configuredAt: new Date(),
      updatedAt: new Date(),
      ...(logoUrl ? { logoUrl } : {})
    })
    .where(eq(orgSettings.id, "org"));
  redirect(nextPath(formData, "/accounts"));
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
  const role = String(formData.get("role") ?? "");
  if (!ROLES.has(role as MembershipRole)) return { error: "Choose a role." };
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) return { error: "Enter an email address." };
  const invite = await createInvitation(database(), {
    accountId,
    email,
    role: role as MembershipRole
  });
  return { secret: `${appUrl()}/invitations/${invite.token}` };
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

async function postAuth(path: string, body: unknown): Promise<Response> {
  const incoming = await import("next/headers").then((mod) => mod.headers());
  const headers = new Headers({
    "content-type": "application/json",
    origin: new URL(appUrl()).origin
  });
  const cookie = incoming.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  return getAuth().handler(
    new Request(`${appUrl()}/api/auth${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    })
  );
}

async function saveSso(body: Record<string, unknown>, formData: FormData): Promise<void> {
  const created = await postAuth("/sso/register", body);
  if (!created.ok) {
    const createdText = await created.text();
    const exists = created.status === 422 && createdText.toLowerCase().includes("already exists");
    if (!exists) failTo(formData, "/settings", "provider");
    const updated = await postAuth("/sso/update-provider", body);
    if (!updated.ok) failTo(formData, "/settings", "provider");
  }
  redirect(nextPath(formData, "/settings?saved=1"));
}

export async function saveOidcProvider(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const providerId = String(formData.get("providerId") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const issuer = String(formData.get("issuer") ?? "")
    .trim()
    .replace(/\/$/, "");
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  if (!providerId || !domain || !issuer || !clientId || !clientSecret)
    failTo(formData, "/settings");
  await saveSso(
    {
      providerId,
      issuer,
      domain,
      oidcConfig: {
        clientId,
        clientSecret,
        discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
        pkce: true,
        mapping: { extraFields: { groups: "groups" } }
      }
    },
    formData
  );
}

export async function testModelKeyAction(
  _previous: { ok: boolean; detail: string } | null
): Promise<{ ok: boolean; detail: string }> {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) return { ok: false, detail: t("model.denied") };
  const config = loadConfig();
  const result = await probeModel({
    provider: config.AI_PROVIDER,
    apiKey: config.AI_API_KEY,
    baseUrl: config.AI_BASE_URL,
    model: config.AI_MODEL_SMALL,
    mock: config.AI_MOCK
  });
  const detail = t(MODEL_DETAIL[result.code]);
  return {
    ok: result.ok,
    detail: result.status ? `${detail} (${result.status})` : detail
  };
}

export async function saveGroupMapping(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const providerId = String(formData.get("providerId") ?? "").trim();
  const groupExternalId = String(formData.get("groupExternalId") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!providerId || !groupExternalId || !target || !role) failTo(formData, "/settings");
  await database()
    .insert(idpGroupMapping)
    .values({
      id: randomUUID(),
      providerId,
      groupExternalId,
      groupDisplay: String(formData.get("groupDisplay") ?? ""),
      target,
      role
    });
  redirect(nextPath(formData, "/settings?saved=1"));
}

export async function saveSamlProvider(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const providerId = String(formData.get("providerId") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const issuer = String(formData.get("issuer") ?? "").trim();
  const entryPoint = String(formData.get("entryPoint") ?? "").trim();
  const certificate = String(formData.get("certificate") ?? "").trim();
  if (!providerId || !domain || !issuer || !entryPoint || !certificate)
    failTo(formData, "/settings");
  const config = samlProviderConfig({
    providerId,
    domain,
    issuer,
    entryPoint,
    certificate,
    callbackUrl: `${appUrl()}/api/auth/sso/saml2/sp/acs/${providerId}`
  });
  await saveSso(
    {
      providerId,
      issuer,
      domain,
      samlConfig: config.samlConfig
    },
    formData
  );
}

export async function issueScimToken(_previous: { secret?: string; error?: string } | null) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage"))
    return { error: "Only an organization admin can create a SCIM token." };
  const created = await getAuth().api.createSCIMManagedConnection({
    body: {
      creationRequestId: randomUUID(),
      provisioningDomainId: "org",
      actorId: principal.id,
      scopes: ["scim.users.read", "scim.users.write", "scim.groups.read", "scim.groups.write"],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }
  });
  return { secret: created.token };
}

export async function importSiteAction(formData: FormData) {
  const principal = await requirePrincipal();
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "site.manage", { accountId })) redirect("/no-access");
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!sourceUrl || !name) redirect("/sites?error=1");
  const config = loadConfig();
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
    await enqueue(config.DATABASE_URL, "import", { siteId, runId, sourceUrl });
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
    host: `${found.slug}.localhost`,
    prefix: snapshotPrefix(siteId, snapshotId),
    hostMapPath: `${config.FS_STORAGE_DIR}/hostmap.json`
  });
  redirect(`/sites/${siteId}`);
}

function editor() {
  const config = loadConfig();
  if (config.AI_MOCK) return undefined;
  return subprocessRunner({
    env: buildAgentEnv(process.env),
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
  const config = loadConfig();
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
      await enqueue(config.DATABASE_URL, "agent-turn", {
        siteId,
        userId: principal.id,
        body,
        userRecorded: true
      });
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
  await approveChange({
    db: database(),
    store: createBlobStore(config),
    changeRequestId: String(formData.get("changeRequestId") ?? ""),
    actorUserId: principal.id,
    host: found ? `${found.slug}.localhost` : undefined,
    hostMapPath: `${config.FS_STORAGE_DIR}/hostmap.json`,
    runner: editor(),
    appOrigin: config.APP_URL
  });
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
    host: found ? `${found.slug}.localhost` : undefined,
    hostMapPath: `${config.FS_STORAGE_DIR}/hostmap.json`,
    prefix: snaps[0]?.storagePrefix
  });
  redirect(`/sites/${siteId}`);
}

export async function releaseHoldAction(formData: FormData) {
  const principal = await requirePrincipal();
  const accountId = String(formData.get("accountId") ?? "");
  if (!can(principal, "member.manage", { accountId }) && !can(principal, "org.manage")) {
    redirect("/no-access");
  }
  const requestId = String(formData.get("changeRequestId") ?? "");
  const rows = await database()
    .select()
    .from(changeRequest)
    .where(eq(changeRequest.id, requestId))
    .limit(1);
  const request = rows[0];
  if (!request?.summary) redirect("/sites");
  await database()
    .update(changeRequest)
    .set({ status: "rejected" })
    .where(eq(changeRequest.id, requestId));
  const config = loadConfig();
  const existing = await database()
    .select()
    .from(thread)
    .where(eq(thread.siteId, request.siteId))
    .limit(1);
  if (existing[0]) {
    await database()
      .update(thread)
      .set({ status: "queued", updatedAt: new Date() })
      .where(eq(thread.id, existing[0].id));
  }
  await enqueue(config.DATABASE_URL, "agent-turn", {
    siteId: request.siteId,
    userId: principal.id,
    body: request.summary,
    allowHold: false
  });
  redirect(`/sites/${request.siteId}`);
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
