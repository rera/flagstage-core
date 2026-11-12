import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import { createAccount, slugify } from "@flagstage/core";
import type { Database } from "@flagstage/db";
import { account, authAccount, importRun, site, user } from "@flagstage/db";
import { runImport } from "@flagstage/importer";
import type { BlobStore } from "@flagstage/storage";

export type Parsed =
  | { kind: "doctor" }
  | { kind: "help" }
  | { kind: "admin-add"; email: string; name?: string }
  | { kind: "account-create"; name: string }
  | { kind: "import"; url: string; account: string; name?: string };

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
        org_role: "org_admin",
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
    name: input.name?.trim() || "Organization admin",
    email,
    emailVerified: true,
    org_role: "org_admin",
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
