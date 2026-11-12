import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import type { Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";
import { account, membership, site, snapshot, user } from "@flagstage/db";
import type { BlobStore, StoredObject } from "@flagstage/storage";

import {
  addMember,
  addOrgAdmin,
  backupPlan,
  createNamedAccount,
  exportSiteArchive,
  importAccountSite,
  parseCommand,
  passwordResetAllowed,
  resetPassword
} from "./commands";

async function applyMigrations(client: PGlite) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/db/drizzle");
  for (const file of ["0000_init.sql", "0001_auth_plugins.sql", "0003_builder.sql", "0004_schedule.sql"]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
}

function memoryStore(): BlobStore {
  const files = new Map<string, StoredObject>();
  return {
    async put(key, body, contentType) {
      files.set(key, { body, contentType: contentType ?? "application/octet-stream" });
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async list(prefix) {
      return [...files.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, size: files.get(key)?.body.byteLength ?? 0 }));
    },
    async delete(key) {
      files.delete(key);
    }
  };
}

describe("flagstage commands", () => {
  it("parses admin, account, and import", () => {
    expect(parseCommand(["admin", "add", "--email", "ops@example.com", "--name", "Ops"])).toEqual({
      kind: "admin-add",
      email: "ops@example.com",
      name: "Ops"
    });
    expect(parseCommand(["account", "create", "Parks"])).toEqual({
      kind: "account-create",
      name: "Parks"
    });
    expect(
      parseCommand(["import", "https://example.com", "--account", "parks", "--name", "Parks site"])
    ).toEqual({
      kind: "import",
      url: "https://example.com",
      account: "parks",
      name: "Parks site"
    });
    expect(
      parseCommand(["member", "add", "--email", "ed@example.com", "--account", "parks"])
    ).toMatchObject({ kind: "member-add", email: "ed@example.com", role: "account_admin" });
    expect(parseCommand(["site", "export", "demo", "--out", "demo.tgz"])).toEqual({
      kind: "site-export",
      site: "demo",
      out: "demo.tgz"
    });
    expect(passwordResetAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(passwordResetAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(passwordResetAllowed({ NODE_ENV: "production", FLAGSTAGE_BREAK_GLASS: "1" })).toBe(true);
  });

  it("adds an admin and creates an account", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    const created = await addOrgAdmin(db, {
      email: "Ops@Example.com",
      name: "Ops",
      password: "local-test-password"
    });
    expect(created.created).toBe(true);
    if (created.created) expect(created.password).toBe("local-test-password");
    const again = await addOrgAdmin(db, { email: "ops@example.com" });
    expect(again.created).toBe(false);
    const people = await db.select().from(user).where(eq(user.email, "ops@example.com"));
    expect(people).toHaveLength(1);
    expect(people[0]?.org_role).toBe("admin");
    const row = await createNamedAccount(db, "Parks");
    expect(row.slug).toBe("parks");
    const accounts = await db.select().from(account);
    expect(accounts).toHaveLength(1);
    await expect(
      importAccountSite({
        db,
        store: memoryStore(),
        accountSlug: "missing",
        url: "https://example.com",
        appOrigin: "http://localhost:3000",
        caps: { maxPages: 1, maxDepth: 1, maxAssets: 1 }
      })
    ).rejects.toThrow(/No account/);
    await client.close();
  });

  it("adds a member, resets a local password, and exports the published snapshot", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    const created = await createNamedAccount(db, "Parks");
    const added = await addMember(db, {
      email: "Ed@Example.com",
      accountSlug: "parks",
      role: "account_admin",
      name: "Ed"
    });
    expect(added.created).toBe(true);
    const again = await addMember(db, {
      email: "ed@example.com",
      accountSlug: "parks",
      role: "account_admin"
    });
    expect(again.created).toBe(false);
    const grants = await db.select().from(membership);
    expect(grants).toHaveLength(1);
    expect(grants[0]?.role).toBe("account_admin");
    expect(grants[0]?.source).toBe("manual");

    const reset = await resetPassword(db, {
      email: "ed@example.com",
      password: "new-password-value"
    });
    expect(reset.password).toBe("new-password-value");

    const store = memoryStore();
    const siteId = "site-1";
    await db.insert(site).values({
      id: siteId,
      accountId: created.id,
      name: "Parks",
      slug: "parks-site",
      status: "live"
    });
    await db.insert(snapshot).values({
      id: "snap-1",
      siteId,
      kind: "publish",
      storagePrefix: "snapshots/site-1/snap-1/",
      fileCount: 1,
      bytes: 10
    });
    await db.update(site).set({ currentSnapshotId: "snap-1" }).where(eq(site.id, siteId));
    await store.put(
      "snapshots/site-1/snap-1/index.html",
      new TextEncoder().encode("<p>hi</p>"),
      "text/html"
    );
    const exported = await exportSiteArchive({ db, store, siteRef: "parks-site" });
    const text = gunzipSync(exported.body).toString("utf8");
    expect(text).toContain("content.json");
    expect(text).toContain("index.html");
    expect(text).toContain("<p>hi</p>");
    expect(text).toContain("parks-site");
    await expect(exportSiteArchive({ db, store, siteRef: "missing" })).rejects.toThrow(/No site/);
    expect(backupPlan({ storage: "s3", bucket: "sites" })).toContain("pg_dump");
    expect(backupPlan({ storage: "s3", bucket: "sites" })).toContain("s3://sites");
    await client.close();
  });
});
