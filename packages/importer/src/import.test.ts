import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { account, importRun, leadForm, site, siteRedirect, type Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";
import type { BlobStore, StoredObject } from "@flagstage/storage";

import {
  approveImport,
  crawlSite,
  registerImporter,
  runImport,
  storeImport,
  type ImportResult
} from "./index";

const html = `<!doctype html><html><head>
<style>.hero{background:url(/wp-content/uploads/bg.png)}</style>
</head><body>
<a href="/about">About</a>
<img src="/wp-content/uploads/a.png">
<form class="wpcf7-form" action="/#wpcf7"><input type="hidden" name="_wpcf7" value="12"></form>
<form id="commentform"></form>
<form role="search"><input name="s"></form>
<a href="/wp-login.php">Log in</a>
<div class="wp-calendar">calendar</div>
</body></html>`;

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
    }
  };
}

async function applyMigrations(client: PGlite) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of [
    "0000_init.sql",
    "0001_auth_plugins.sql",
    "0003_builder.sql",
    "0004_schedule.sql"
  ]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
}

describe("site import", () => {
  it("imports a fixture site, records redirects and the form, and goes live on approval", async () => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const send = (body: string, type: string) => {
        response.setHeader("content-type", type);
        response.end(body);
      };
      if (url.pathname === "/wp-json") return send("{}", "application/json");
      if (url.pathname === "/wp-sitemap.xml") {
        const origin = `http://127.0.0.1:${request.socket.localPort ?? 0}`;
        return send(`<urlset><url><loc>${origin}/about</loc></url></urlset>`, "application/xml");
      }
      if (url.pathname === "/wp-json/wp/v2/posts") {
        const origin = `http://127.0.0.1:${request.socket.localPort ?? 0}`;
        return send(
          JSON.stringify([{ id: 7, link: `${origin}/hello`, modified: "2026-01-01" }]),
          "application/json"
        );
      }
      if (url.pathname === "/wp-json/wp/v2/pages") return send("[]", "application/json");
      if (url.pathname === "/wp-content/uploads/a.png") {
        response.setHeader("content-type", "image/png");
        response.end(Buffer.from([137, 80, 78, 71]));
        return;
      }
      if (url.pathname === "/" || url.pathname === "/about" || url.pathname === "/hello")
        return send(html, "text/html");
      response.writeHead(404);
      response.end("missing");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    const client = new PGlite();
    try {
      await applyMigrations(client);
      const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
      await db.insert(account).values({ id: "acct-1", name: "Digital", slug: "digital" });
      await db.insert(site).values({
        id: "site-1",
        accountId: "acct-1",
        name: "Fixture",
        slug: "fixture",
        sourceUrl: origin
      });
      await db
        .insert(importRun)
        .values({ id: "run-1", siteId: "site-1", sourceUrl: origin, status: "running" });
      const crawl = await crawlSite({
        sourceUrl: origin,
        appOrigin: "http://localhost:3000",
        siteId: "site-1",
        caps: { maxPages: 20, maxDepth: 2, maxAssets: 20 },
        fetchPage: async (url) => {
          const response = await fetch(url);
          const body = new Uint8Array(await response.arrayBuffer());
          return {
            status: response.status,
            body,
            contentType: response.headers.get("content-type") ?? ""
          };
        }
      });
      const store = memoryStore();
      const hostMapPath = join(mkdtempSync(join(tmpdir(), "hostmap-")), "hostmap.json");
      const stored = await storeImport({
        db,
        store,
        siteId: "site-1",
        importRunId: "run-1",
        result: crawl
      });
      const home = [...store.files.keys()].find((key) => key.endsWith("index.html"));
      expect(home).toBeTruthy();
      const page = new TextDecoder().decode(store.files.get(home ?? "")?.body);
      expect(page).toContain("http://localhost:3000/f/site-1/cf7-12");
      expect(crawl.report.forms.some((item) => item.kind === "contact-form-7")).toBe(true);
      expect([...new Set(crawl.report.plugins.map((item) => item.kind))].sort()).toEqual([
        "calendar",
        "comments",
        "login",
        "search"
      ]);
      expect(crawl.report.cssBackgrounds).toContain("/wp-content/uploads/bg.png");
      expect(crawl.pages.map((file) => file.path).sort()).toEqual([
        "about/index.html",
        "hello/index.html",
        "index.html"
      ]);
      expect(crawl.assets.map((file) => file.path)).toEqual(["wp-content/uploads/a.png"]);
      expect(crawl.stats).toMatchObject({ pages: 3, assets: 1 });
      expect(
        crawl.redirects.some(
          (row) => row.fromPath === "/?p=7" && row.toPath === "/hello" && row.source === "wordpress"
        )
      ).toBe(true);
      expect([...store.files.keys()].some((key) => key.endsWith("wp-content/uploads/a.png"))).toBe(
        true
      );
      const redirects = await db.select().from(siteRedirect);
      expect(redirects.some((row) => row.fromPath === "/?p=7" && row.toPath === "/hello")).toBe(
        true
      );
      expect(redirects.some((row) => row.fromPath === "/feed/" && row.toPath === "/")).toBe(true);
      const forms = await db.select().from(leadForm);
      expect(forms.map((row) => row.formKey)).toContain("cf7-12");
      const live = await db.select().from(site).where(eq(site.id, "site-1"));
      expect(live[0]?.currentSnapshotId).toBeNull();
      await approveImport({
        db,
        siteId: "site-1",
        snapshotId: stored.snapshotId,
        host: "fixture.localhost",
        prefix: `snapshots/site-1/${stored.snapshotId}/`,
        hostMapPath
      });
      const after = await db.select().from(site).where(eq(site.id, "site-1"));
      expect(after[0]?.currentSnapshotId).toBe(stored.snapshotId);
      expect(after[0]?.status).toBe("live");
      const map = JSON.parse(readFileSync(hostMapPath, "utf8")) as Record<string, string>;
      expect(map["fixture.localhost"]).toContain(stored.snapshotId);
      const run = await db.select().from(importRun);
      expect(run[0]?.status).toBe("preview");
    } finally {
      await client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("marks a queued import failed when the site does not answer", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    await db.insert(account).values({ id: "acct-2", name: "Membership", slug: "membership" });
    await db.insert(site).values({
      id: "site-2",
      accountId: "acct-2",
      name: "Quiet",
      slug: "quiet",
      sourceUrl: "https://example.test",
      status: "importing"
    });
    await db.insert(importRun).values({
      id: "run-2",
      siteId: "site-2",
      sourceUrl: "https://example.test",
      status: "queued"
    });
    const stored = await runImport({
      db,
      store: memoryStore(),
      siteId: "site-2",
      importRunId: "run-2",
      sourceUrl: "https://example.test",
      appOrigin: "http://localhost:3000",
      caps: { maxPages: 5, maxDepth: 1, maxAssets: 5 },
      fetchPage: async () => ({ status: 500, body: new Uint8Array(), contentType: "text/html" })
    });
    expect(stored.snapshotId).toBeUndefined();
    const rows = await db.select().from(importRun).where(eq(importRun.id, "run-2"));
    expect(rows[0]?.status).toBe("failed");
    const sites = await db.select().from(site).where(eq(site.id, "site-2"));
    expect(sites[0]?.status).toBe("failed");
    await client.close();
  });

  it("stores the result of the source named on the run", async () => {
    const result: ImportResult = {
      pages: [
        {
          path: "index.html",
          body: new TextEncoder().encode("<p>from the fixture source</p>"),
          contentType: "text/html; charset=utf-8"
        }
      ],
      assets: [
        {
          path: "assets/mark.svg",
          body: new TextEncoder().encode("<svg></svg>"),
          contentType: "image/svg+xml"
        }
      ],
      redirects: [{ fromPath: "/old", toPath: "/", source: "fixture-source" }],
      forms: [{ formKey: "hello", name: "Hello", page: "/" }],
      report: {
        forms: [{ page: "/", kind: "hello", detail: "Mapped from the fixture source." }],
        plugins: [],
        missingAssets: [],
        cssBackgrounds: []
      },
      stats: { pages: 1, assets: 1, pagesFound: 1, pagesDone: 1, skipped: [] }
    };
    registerImporter({
      name: "fixture-source",
      async run(options) {
        await options.onProgress?.({ pagesFound: 1, pagesDone: 0, skipped: [] });
        return result;
      }
    });
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    await db.insert(account).values({ id: "acct-3", name: "Events", slug: "events" });
    await db.insert(site).values({
      id: "site-3",
      accountId: "acct-3",
      name: "Fixture source",
      slug: "fixture-source",
      sourceUrl: "https://example.test",
      status: "importing"
    });
    await db.insert(importRun).values({
      id: "run-3",
      siteId: "site-3",
      sourceUrl: "https://example.test",
      status: "queued"
    });
    const store = memoryStore();
    const stored = await runImport({
      db,
      store,
      siteId: "site-3",
      importRunId: "run-3",
      sourceUrl: "https://example.test",
      appOrigin: "http://localhost:3000",
      caps: { maxPages: 5, maxDepth: 1, maxAssets: 5 },
      source: "fixture-source",
      fetchPage: async () => {
        throw new Error("The named source should not fetch.");
      }
    });
    expect(stored.snapshotId).toBeTruthy();
    const home = [...store.files.keys()].find((key) => key.endsWith("index.html"));
    expect(new TextDecoder().decode(store.files.get(home ?? "")?.body)).toContain(
      "from the fixture source"
    );
    expect([...store.files.keys()].some((key) => key.endsWith("assets/mark.svg"))).toBe(true);
    const redirects = await db.select().from(siteRedirect);
    expect(
      redirects.some((row) => row.fromPath === "/old" && row.source === "fixture-source")
    ).toBe(true);
    const forms = await db.select().from(leadForm);
    expect(forms.map((row) => row.formKey)).toContain("hello");
    const run = await db.select().from(importRun).where(eq(importRun.id, "run-3"));
    expect(run[0]?.status).toBe("preview");
    expect(run[0]?.fidelityReport).toMatchObject({
      forms: [{ page: "/", kind: "hello" }]
    });
    const sites = await db.select().from(site).where(eq(site.id, "site-3"));
    expect(sites[0]?.status).toBe("preview");
    expect(sites[0]?.draftSnapshotId).toBe(stored.snapshotId);
    await client.close();
  });

  it("records progress from the source, then fails the run when that source throws", async () => {
    registerImporter({
      name: "progress-source",
      async run(options) {
        await options.onProgress?.({
          pagesFound: 4,
          pagesDone: 2,
          skipped: [{ path: "/gone", reason: "HTTP 404" }]
        });
        throw new Error("stopped after progress");
      }
    });
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    await db.insert(account).values({ id: "acct-4", name: "News", slug: "news" });
    await db.insert(site).values({
      id: "site-4",
      accountId: "acct-4",
      name: "Progress",
      slug: "progress",
      sourceUrl: "https://example.test",
      status: "importing"
    });
    await db.insert(importRun).values({
      id: "run-4",
      siteId: "site-4",
      sourceUrl: "https://example.test",
      status: "queued"
    });
    const stored = await runImport({
      db,
      store: memoryStore(),
      siteId: "site-4",
      importRunId: "run-4",
      sourceUrl: "https://example.test",
      appOrigin: "http://localhost:3000",
      caps: { maxPages: 5, maxDepth: 1, maxAssets: 5 },
      source: "progress-source"
    });
    expect(stored.snapshotId).toBeUndefined();
    const run = await db.select().from(importRun).where(eq(importRun.id, "run-4"));
    expect(run[0]?.status).toBe("failed");
    expect(run[0]?.error).toBe("stopped after progress");
    expect(run[0]?.stats).toEqual({
      pagesFound: 4,
      pagesDone: 2,
      skipped: [{ path: "/gone", reason: "HTTP 404" }]
    });
    await client.close();
  });

  it("fails the run when the source name is not registered", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    await db.insert(account).values({ id: "acct-5", name: "Tours", slug: "tours" });
    await db.insert(site).values({
      id: "site-5",
      accountId: "acct-5",
      name: "Missing source",
      slug: "missing-source",
      sourceUrl: "https://example.test",
      status: "importing"
    });
    await db.insert(importRun).values({
      id: "run-5",
      siteId: "site-5",
      sourceUrl: "https://example.test",
      status: "queued"
    });
    const stored = await runImport({
      db,
      store: memoryStore(),
      siteId: "site-5",
      importRunId: "run-5",
      sourceUrl: "https://example.test",
      appOrigin: "http://localhost:3000",
      caps: { maxPages: 5, maxDepth: 1, maxAssets: 5 },
      source: "no-such-source"
    });
    expect(stored.snapshotId).toBeUndefined();
    const run = await db.select().from(importRun).where(eq(importRun.id, "run-5"));
    expect(run[0]?.status).toBe("failed");
    expect(run[0]?.error).toContain("no-such-source");
    const sites = await db.select().from(site).where(eq(site.id, "site-5"));
    expect(sites[0]?.status).toBe("failed");
    await client.close();
  });
});
