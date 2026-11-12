import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import type { Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";
import { account, user } from "@flagstage/db";
import type { BlobStore, StoredObject } from "@flagstage/storage";

import { addOrgAdmin, createNamedAccount, importAccountSite, parseCommand } from "./commands";

async function applyMigrations(client: PGlite) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/db/drizzle");
  for (const file of ["0000_init.sql", "0001_auth_plugins.sql"]) {
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
  });

  it("adds an organization admin and creates an account", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    const created = await addOrgAdmin(db, {
      email: "Ops@Example.com",
      name: "Ops",
      password: "demo-demo-demo"
    });
    expect(created.created).toBe(true);
    if (created.created) expect(created.password).toBe("demo-demo-demo");
    const again = await addOrgAdmin(db, { email: "ops@example.com" });
    expect(again.created).toBe(false);
    const people = await db.select().from(user).where(eq(user.email, "ops@example.com"));
    expect(people).toHaveLength(1);
    expect(people[0]?.org_role).toBe("org_admin");
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
});
