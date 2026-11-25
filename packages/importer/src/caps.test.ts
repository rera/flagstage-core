import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { DEFAULT_IMPORT_MAX_ASSETS, DEFAULT_IMPORT_MAX_PAGES } from "@flagstage/config";
import { updateImporterSettings, type Principal } from "@flagstage/core";
import { account, importRun, site, type Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";
import type { BlobStore, StoredObject } from "@flagstage/storage";

import { readImportCaps, runImport } from "./index";

const admin: Principal = { id: "admin-1", orgRole: "admin", memberships: [] };

function memoryStore(): BlobStore & { files: Map<string, StoredObject> } {
  const files = new Map<string, StoredObject>();
  return {
    files,
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
    },
    async copy(from, to) {
      const object = files.get(from);
      if (!object) throw new Error(`Missing ${from}`);
      files.set(to, { body: new Uint8Array(object.body), contentType: object.contentType });
    }
  };
}

async function database(files: string[]) {
  const client = new PGlite();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of files) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
  const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
  return { client, db };
}

describe("readImportCaps", () => {
  it("uses the platform defaults when the settings row is missing", async () => {
    const { client, db } = await database(["0005_importer_settings.sql", "0008_import_caps.sql"]);
    expect(await readImportCaps(db, 3)).toEqual({
      maxPages: DEFAULT_IMPORT_MAX_PAGES,
      maxDepth: 3,
      maxAssets: DEFAULT_IMPORT_MAX_ASSETS
    });
    await client.close();
  });

  it("reads max pages and max assets from the platform row", async () => {
    const { client, db } = await database(["0005_importer_settings.sql", "0008_import_caps.sql"]);
    await updateImporterSettings(db, admin, { maxPages: 12, maxAssets: 34 });
    expect(await readImportCaps(db, 6)).toEqual({ maxPages: 12, maxDepth: 6, maxAssets: 34 });
    await client.close();
  });

  it("applies the database page cap during import", async () => {
    const { client, db } = await database([
      "0000_init.sql",
      "0001_auth_plugins.sql",
      "0003_builder.sql",
      "0004_schedule.sql",
      "0005_importer_settings.sql",
      "0007_snapshot_bytes.sql",
      "0008_import_caps.sql"
    ]);
    await updateImporterSettings(db, admin, { maxPages: 1, maxAssets: 5 });
    await db.insert(account).values({ id: "acct-caps", name: "Caps", slug: "caps" });
    await db.insert(site).values({
      id: "site-caps",
      accountId: "acct-caps",
      name: "Caps",
      slug: "caps",
      sourceUrl: "https://caps.example",
      status: "importing"
    });
    await db.insert(importRun).values({
      id: "run-caps",
      siteId: "site-caps",
      sourceUrl: "https://caps.example",
      status: "queued"
    });
    const fetched: string[] = [];
    const stored = await runImport({
      db,
      store: memoryStore(),
      siteId: "site-caps",
      importRunId: "run-caps",
      sourceUrl: "https://caps.example",
      appOrigin: "http://localhost:3000",
      caps: { maxPages: 40, maxDepth: 2, maxAssets: 40 },
      fetchPage: async (url) => {
        const path = new URL(url).pathname;
        fetched.push(path);
        if (path === "/sitemap.xml") {
          const locs = [1, 2, 3, 4]
            .map((index) => `<url><loc>https://caps.example/p/${index}</loc></url>`)
            .join("");
          return {
            status: 200,
            body: new TextEncoder().encode(`<urlset>${locs}</urlset>`),
            contentType: "application/xml"
          };
        }
        if (path === "/" || path.startsWith("/p/")) {
          return {
            status: 200,
            body: new TextEncoder().encode(`<p>${path}</p>`),
            contentType: "text/html"
          };
        }
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    });
    expect(stored.snapshotId).toBeTruthy();
    const run = await db.select().from(importRun).where(eq(importRun.id, "run-caps"));
    expect(run[0]?.stats).toMatchObject({ pages: 1 });
    expect(fetched.filter((path) => path.startsWith("/p/"))).toEqual([]);
    await client.close();
  });
});
