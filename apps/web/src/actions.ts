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
import { idpGroupMapping, importRun, orgSettings, site, ssoProvider } from "@flagstage/db";
import { approveImport, crawlSite, storeCrawl } from "@flagstage/importer";
import { createBlobStore, snapshotPrefix } from "@flagstage/storage";
import { samlProviderConfig } from "@flagstage/auth";
import {
  approveChange,
  buildAgentEnv,
  postMessage,
  skillsDirectory,
  subprocessRunner
} from "@flagstage/agent";
import { rollbackTo } from "@flagstage/publish";
import { changeRequest, snapshot } from "@flagstage/db";

import { getAuth } from "./auth";
import { applyAuthResponse } from "./cookies";
import { database, requirePrincipal } from "./guard";

const ROLES = new Set<MembershipRole>(["account_admin", "editor", "reviewer"]);

function appUrl() {
  return loadConfig().APP_URL;
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
  if (!name || !baseDomain) redirect("/setup?error=1");
  await database()
    .update(orgSettings)
    .set({
      name,
      baseDomain,
      previewDomain: baseDomain,
      configuredAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(orgSettings.id, "org"));
  redirect("/accounts");
}

export async function createAccountAction(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/accounts?error=1");
  const created = await createAccount(database(), name);
  redirect(`/accounts/${created.id}`);
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

export async function saveOidcProvider(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const providerId = String(formData.get("providerId") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const issuer = String(formData.get("issuer") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  if (!providerId || !domain || !issuer || !clientId || !clientSecret)
    redirect("/settings?error=1");
  const db = database();
  const existing = await db
    .select()
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1);
  const oidcConfig = JSON.stringify({
    clientId,
    clientSecret,
    discoveryEndpoint: `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
    pkce: true,
    mapping: { extraFields: { groups: "groups" } }
  });
  if (existing[0]) {
    await db
      .update(ssoProvider)
      .set({ issuer, domain, oidcConfig })
      .where(eq(ssoProvider.id, existing[0].id));
  } else {
    await db.insert(ssoProvider).values({
      id: randomUUID(),
      providerId,
      issuer,
      domain,
      oidcConfig
    });
  }
  redirect("/settings?saved=1");
}

export async function saveGroupMapping(formData: FormData) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/no-access");
  const providerId = String(formData.get("providerId") ?? "").trim();
  const groupExternalId = String(formData.get("groupExternalId") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!providerId || !groupExternalId || !target || !role) redirect("/settings?error=1");
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
  redirect("/settings?saved=1");
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
    redirect("/settings?error=1");
  const config = samlProviderConfig({
    providerId,
    domain,
    issuer,
    entryPoint,
    certificate,
    callbackUrl: `${appUrl()}/api/auth/sso/saml2/sp/acs/${providerId}`
  });
  const db = database();
  const existing = await db
    .select()
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1);
  const samlConfig = JSON.stringify(config.samlConfig);
  if (existing[0]) {
    await db
      .update(ssoProvider)
      .set({ issuer, domain, samlConfig })
      .where(eq(ssoProvider.id, existing[0].id));
  } else {
    await db
      .insert(ssoProvider)
      .values({ id: randomUUID(), providerId, issuer, domain, samlConfig });
  }
  redirect("/settings?saved=1");
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

async function fetchPage(url: string) {
  const response = await fetch(url, { redirect: "follow" });
  return {
    status: response.status,
    body: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? ""
  };
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
  await db.insert(importRun).values({ id: runId, siteId, sourceUrl, status: "running" });
  let snapshotId = "";
  try {
    const crawl = await crawlSite({
      fetchPage,
      sourceUrl,
      appOrigin: config.APP_URL,
      siteId,
      caps: {
        maxPages: config.IMPORT_MAX_PAGES,
        maxDepth: config.IMPORT_MAX_DEPTH,
        maxAssets: config.IMPORT_MAX_ASSETS
      }
    });
    const stored = await storeCrawl({
      db,
      store: createBlobStore(config),
      siteId,
      importRunId: runId,
      crawl
    });
    snapshotId = stored.snapshotId;
  } catch (error) {
    await db
      .update(importRun)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "Import failed",
        updatedAt: new Date()
      })
      .where(eq(importRun.id, runId));
    await db.update(site).set({ status: "failed" }).where(eq(site.id, siteId));
    redirect("/sites?error=1");
  }
  redirect(`/sites/${siteId}?snapshot=${snapshotId}`);
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
  if (
    !can(principal, "site.comment", { accountId }) &&
    !can(principal, "site.edit", { accountId })
  ) {
    redirect("/no-access");
  }
  const config = loadConfig();
  await postMessage({
    db: database(),
    store: createBlobStore(config),
    siteId,
    userId: principal.id,
    body: String(formData.get("body") ?? ""),
    appOrigin: config.APP_URL,
    runner: editor(),
    commentOnly: !can(principal, "site.edit", { accountId })
  });
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
    runner: editor()
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
  await postMessage({
    db: database(),
    store: createBlobStore(config),
    siteId: request.siteId,
    userId: principal.id,
    body: request.summary,
    appOrigin: config.APP_URL,
    runner: editor(),
    allowHold: false
  });
  redirect(`/sites/${request.siteId}`);
}
