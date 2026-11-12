import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import { createAccount, slugify, type MembershipRole } from "@flagstage/core";
import type { Database } from "@flagstage/db";
import { account, authAccount, importRun, membership, site, snapshot, user } from "@flagstage/db";
import { runImport } from "@flagstage/importer";
import type { BlobStore } from "@flagstage/storage";

import { packTarGz } from "./archive";

export type Parsed =
  | { kind: "doctor" }
  | { kind: "help" }
  | { kind: "admin-add"; email: string; name?: string }
  | { kind: "account-create"; name: string }
  | { kind: "import"; url: string; account: string; name?: string }
  | { kind: "member-add"; email: string; account: string; role: MembershipRole; name?: string }
  | { kind: "reset-password"; email: string; password?: string }
  | { kind: "site-export"; site: string; out: string }
  | { kind: "backup" };

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

export function parseCommand(argv: string[]): Parsed {
  const [command, sub, ...rest] = argv;
  if (!command || command === "help" || command === "--help") return { kind: "help" };
  if (command === "doctor") return { kind: "doctor" };
  if (command === "admin" && sub === "add") {
    const email = flag(rest, "--email") ?? rest.find((arg) => arg.includes("@"));
    if (!email) throw new Error("flagstage admin add --email <email> [--name <name>]");
    return { kind: "admin-add", email, name: flag(rest, "--name") };
  }
  if (command === "account" && sub === "create") {
    const name = rest
      .filter((arg) => !arg.startsWith("--"))
      .join(" ")
      .trim();
    if (!name) throw new Error("flagstage account create <name>");
    return { kind: "account-create", name };
  }
  if (command === "import") {
    const url = sub;
    const accountSlug = flag([sub ?? "", ...rest], "--account");
    if (!url || !accountSlug)
      throw new Error("flagstage import <url> --account <slug> [--name <name>]");
    return { kind: "import", url, account: accountSlug, name: flag(rest, "--name") };
  }
  if (command === "member" && sub === "add") {
    const email = flag(rest, "--email");
    const accountSlug = flag(rest, "--account");
    const role = flag(rest, "--role") ?? "account_admin";
    if (!email || !accountSlug || role !== "account_admin") {
      throw new Error("flagstage member add --email <email> --account <slug>");
    }
    return {
      kind: "member-add",
      email,
      account: accountSlug,
      role: role as MembershipRole,
      name: flag(rest, "--name")
    };
  }
  if (command === "user" && sub === "reset-password") {
    const email = flag(rest, "--email");
    if (!email) throw new Error("flagstage user reset-password --email <email>");
    return { kind: "reset-password", email, password: flag(rest, "--password") };
  }
  if (command === "site" && sub === "export") {
    const siteRef = rest.find((arg) => !arg.startsWith("--"));
    const out = flag(rest, "--out");
    if (!siteRef || !out) throw new Error("flagstage site export <site> --out <file.tgz>");
    return { kind: "site-export", site: siteRef, out };
  }
  if (command === "backup") return { kind: "backup" };
  throw new Error(`Unknown command '${command}${sub ? ` ${sub}` : ""}'.`);
}

export async function addOrgAdmin(
  db: Database,
  input: { email: string; name?: string; password?: string }
) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter an email address.");
  const now = new Date();
  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const current = existing[0];
  if (current) {
    await db
      .update(user)
      .set({
        org_role: "admin",
        org_role_source: "manual",
        name: input.name?.trim() || current.name,
        updatedAt: now
      })
      .where(eq(user.id, current.id));
    return { email, created: false as const };
  }
  const password = input.password ?? randomBytes(18).toString("base64url");
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: input.name?.trim() || "Admin",
    email,
    emailVerified: true,
    org_role: "admin",
    org_role_source: "manual",
    createdAt: now,
    updatedAt: now
  });
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  });
  return { email, created: true as const, password };
}

export async function createNamedAccount(db: Database, name: string) {
  const created = await createAccount(db, name);
  return created;
}

export async function importAccountSite(input: {
  db: Database;
  store: BlobStore;
  accountSlug: string;
  url: string;
  name?: string;
  appOrigin: string;
  caps: { maxPages: number; maxDepth: number; maxAssets: number };
}) {
  const rows = await input.db
    .select()
    .from(account)
    .where(eq(account.slug, input.accountSlug))
    .limit(1);
  const found = rows[0];
  if (!found) throw new Error(`No account with slug ${input.accountSlug}.`);
  const siteId = randomUUID();
  const runId = randomUUID();
  const name = input.name?.trim() || new URL(input.url).hostname;
  await input.db.insert(site).values({
    id: siteId,
    accountId: found.id,
    name,
    slug: slugify(name),
    sourceUrl: input.url,
    status: "importing"
  });
  await input.db.insert(importRun).values({
    id: runId,
    siteId,
    sourceUrl: input.url,
    status: "queued"
  });
  const stored = await runImport({
    db: input.db,
    store: input.store,
    siteId,
    importRunId: runId,
    sourceUrl: input.url,
    appOrigin: input.appOrigin,
    caps: input.caps
  });
  if (!stored.snapshotId) throw new Error("Import failed.");
  return { siteId, snapshotId: stored.snapshotId, slug: slugify(name) };
}

async function ensureCredentialUser(
  db: Database,
  input: { email: string; name?: string; password?: string; orgRole: "admin" | "none" }
) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter an email address.");
  const now = new Date();
  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const current = existing[0];
  if (current) return { id: current.id, email, created: false as const };
  const password = input.password ?? randomBytes(18).toString("base64url");
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: input.name?.trim() || email,
    email,
    emailVerified: true,
    org_role: input.orgRole,
    org_role_source: "manual",
    createdAt: now,
    updatedAt: now
  });
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  });
  return { id, email, created: true as const, password };
}

export async function addMember(
  db: Database,
  input: { email: string; accountSlug: string; role: MembershipRole; name?: string }
) {
  const accounts = await db
    .select()
    .from(account)
    .where(eq(account.slug, input.accountSlug))
    .limit(1);
  const found = accounts[0];
  if (!found) throw new Error(`No account with slug ${input.accountSlug}.`);
  const person = await ensureCredentialUser(db, {
    email: input.email,
    name: input.name,
    orgRole: "none"
  });
  const existing = await db
    .select()
    .from(membership)
    .where(and(eq(membership.userId, person.id), eq(membership.accountId, found.id)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(membership)
      .set({ role: input.role, source: "manual" })
      .where(eq(membership.id, existing[0].id));
  } else {
    await db.insert(membership).values({
      id: randomUUID(),
      accountId: found.id,
      userId: person.id,
      role: input.role,
      source: "manual"
    });
  }
  return {
    email: person.email,
    account: found.slug,
    role: input.role,
    created: person.created,
    password: person.created ? person.password : undefined
  };
}

export function passwordResetAllowed(env: {
  NODE_ENV?: string;
  FLAGSTAGE_BREAK_GLASS?: string;
}): boolean {
  if (env.NODE_ENV !== "production") return true;
  return env.FLAGSTAGE_BREAK_GLASS === "1";
}

export async function resetPassword(db: Database, input: { email: string; password?: string }) {
  const email = input.email.trim().toLowerCase();
  const people = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const person = people[0];
  if (!person) throw new Error(`No user with email ${email}.`);
  const password = input.password ?? randomBytes(18).toString("base64url");
  const hashed = await hashPassword(password);
  const now = new Date();
  const credentials = await db
    .select()
    .from(authAccount)
    .where(and(eq(authAccount.userId, person.id), eq(authAccount.providerId, "credential")))
    .limit(1);
  if (credentials[0]) {
    await db
      .update(authAccount)
      .set({ password: hashed, updatedAt: now })
      .where(eq(authAccount.id, credentials[0].id));
  } else {
    await db.insert(authAccount).values({
      id: randomUUID(),
      accountId: person.id,
      providerId: "credential",
      userId: person.id,
      password: hashed,
      createdAt: now,
      updatedAt: now
    });
  }
  return { email, password };
}

export async function exportSiteArchive(input: {
  db: Database;
  store: BlobStore;
  siteRef: string;
}): Promise<{ filename: string; body: Buffer }> {
  const bySlug = await input.db.select().from(site).where(eq(site.slug, input.siteRef)).limit(1);
  const byId = bySlug[0]
    ? bySlug
    : await input.db.select().from(site).where(eq(site.id, input.siteRef)).limit(1);
  const found = byId[0];
  if (!found) throw new Error(`No site ${input.siteRef}.`);
  if (!found.currentSnapshotId) throw new Error("Publish the site before exporting it.");
  const snaps = await input.db
    .select()
    .from(snapshot)
    .where(eq(snapshot.id, found.currentSnapshotId))
    .limit(1);
  const current = snaps[0];
  if (!current) throw new Error("The published snapshot is missing.");
  const listed = await input.store.list(current.storagePrefix);
  const files: Array<{ name: string; body: Uint8Array }> = [];
  const paths: string[] = [];
  for (const item of listed) {
    const relative = item.key.slice(current.storagePrefix.length).replace(/^\/+/, "");
    if (!relative || relative.endsWith("/")) continue;
    const object = await input.store.get(item.key);
    if (!object) continue;
    paths.push(relative);
    files.push({ name: `files/${relative}`, body: object.body });
  }
  const content = {
    site: {
      id: found.id,
      name: found.name,
      slug: found.slug,
      sourceUrl: found.sourceUrl,
      status: found.status
    },
    snapshot: { id: current.id, kind: current.kind, createdAt: current.createdAt.toISOString() },
    files: paths
  };
  files.unshift({
    name: "content.json",
    body: new TextEncoder().encode(`${JSON.stringify(content, null, 2)}\n`)
  });
  return { filename: `${found.slug}.tgz`, body: packTarGz(files) };
}

export function backupPlan(input: {
  storage: "fs" | "s3";
  bucket?: string;
  directory?: string;
}): string {
  const files =
    input.storage === "s3"
      ? [
          `aws s3 sync s3://${input.bucket ?? "BUCKET"} ./site-files`,
          `aws s3 sync ./site-files s3://${input.bucket ?? "BUCKET"}`
        ]
      : [`Copy the directory ${input.directory ?? "FS_STORAGE_DIR"}.`];
  return [
    "Database. The URL stays in the environment so the password is not printed.",
    'pg_dump --format=custom --file flagstage.dump "$DATABASE_URL"',
    'pg_restore --clean --if-exists --dbname="$DATABASE_URL" flagstage.dump',
    "",
    "Snapshot files.",
    ...files,
    "",
    "One site: flagstage site export <slug> --out site.tgz",
    "Details: docs/backup-restore.md"
  ].join("\n");
}
