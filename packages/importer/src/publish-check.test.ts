import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { account, importRun, site, type Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";
import type { BlobStore, StoredObject } from "@flagstage/storage";

import { addBaseline } from "./baseline";
import { approveImport, extractSharedBlocks, scaffoldSite, storeImport } from "./index";
import type { CapturedFile, ImportResult } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PARAGRAPH = "The north gate closes at dusk after the last tram.";

function memoryStore(): BlobStore & { files: Map<string, StoredObject> } {
  const files = new Map<string, StoredObject>();
  return {
    files,
    async put(key, body, contentType) {
      files.set(key, {
        body: new Uint8Array(body),
        contentType: contentType ?? "application/octet-stream"
      });
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

async function applyMigrations(client: PGlite) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of [
    "0000_init.sql",
    "0001_auth_plugins.sql",
    "0003_builder.sql",
    "0004_schedule.sql",
    "0005_importer_settings.sql"
  ]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
}

function page(path: string, active: string, main: string): { path: string; html: string } {
  const home = active === "/" ? `<a href="/" class="current">Home</a>` : `<a href="/">Home</a>`;
  const news =
    active === "/news"
      ? `<a href="/news" class="active" aria-current="page">News</a>`
      : `<a href="/news">News</a>`;
  return {
    path,
    html: `<!doctype html><html><head><title>Page</title></head><body>
<header class="site-header">${home}${news}Grove header</header>
${main}
<footer>Grove footer</footer>
</body></html>`
  };
}

function captured(path: string, html: string): CapturedFile {
  return { path, body: encoder.encode(html), contentType: "text/html; charset=utf-8" };
}

const LEGACY_HITS = [
  {
    page: "index.html",
    kind: "form-action",
    detail: 'Form action "https://forms.grove.co.uk/join" still points at the imported site.'
  },
  {
    page: "index.html",
    kind: "formaction",
    detail: 'Button formaction "https://grove.co.uk/save" still points at the imported site.'
  },
  {
    page: "index.html",
    kind: "form-action",
    detail: 'Form action "/search" still points at the imported site.'
  }
];

function legacyOf(report: unknown) {
  return (
    report as {
      legacyForms?: Array<{ page: string; kind: string; detail: string }>;
    }
  ).legacyForms;
}

function imported(pages: Array<{ path: string; html: string }>): ImportResult {
  return {
    pages: pages.map((item) => captured(item.path, item.html)),
    assets: [],
    redirects: [],
    forms: [],
    report: { forms: [], plugins: [], missingAssets: [], cssBackgrounds: [], uncertain: [] },
    stats: { pages: pages.length, assets: 0 }
  };
}

describe("publish checks on go-live", () => {
  it("covers a crawled page that the build replaces with a generated listing", () => {
    const page = { path: "news/index.html", html: "<h1>News</h1><p>Card 01</p>" };
    const result = addBaseline(
      {
        pages: [
          captured(page.path, page.html),
          captured(
            ".flagstage/listings.json",
            JSON.stringify({
              groups: [{ landing: "/news/index.html", output: "/news/page/{n}.html" }]
            })
          )
        ],
        redirects: [],
        assets: [],
        forms: [],
        report: { forms: [], plugins: [], missingAssets: [], cssBackgrounds: [], uncertain: [] },
        stats: { pages: 1, assets: 0 }
      },
      [page]
    );
    const baseline = JSON.parse(
      decoder.decode(result.pages.find((file) => file.path.endsWith("baseline.json"))?.body)
    ) as { covered: Array<{ path: string; by: string }> };
    expect(baseline.covered).toEqual([{ path: "news/index.html", by: "listing" }]);
  });

  it("blocks the first publish when content is missing, then warns and publishes on a later edit", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    await db.insert(account).values({ id: "acct-1", name: "Parks", slug: "parks" });
    await db.insert(site).values({
      id: "site-1",
      accountId: "acct-1",
      name: "Parks",
      slug: "parks",
      sourceUrl: "https://example.test",
      status: "importing"
    });
    await db.insert(importRun).values({
      id: "run-1",
      siteId: "site-1",
      sourceUrl: "https://example.test",
      status: "queued"
    });
    const home = page(
      "index.html",
      "/",
      `<main><h1>Home</h1><p>${PARAGRAPH}</p><img src="/img/heron.jpg" alt="Heron"></main>`
    );
    const about = page(
      "about/index.html",
      "/news",
      "<main><h1>About</h1><p>The east meadow keeps a second paragraph for this page.</p></main>"
    );
    const originals = [home, about];
    const result = addBaseline(
      await scaffoldSite(extractSharedBlocks(imported(originals))),
      originals
    );
    const store = memoryStore();
    const stored = await storeImport({
      db,
      store,
      siteId: "site-1",
      importRunId: "run-1",
      result
    });
    const prefix = `snapshots/site-1/${stored.snapshotId}/`;
    const sourceKey = `${prefix}src/index.html`;
    const hostMap = join(mkdtempSync(join(tmpdir(), "publish-check-map-")), "hostmap.json");

    const intact = await approveImport({
      db,
      store,
      siteId: "site-1",
      snapshotId: stored.snapshotId,
      host: "parks.localhost",
      hostMapPath: hostMap
    });
    expect(intact.ok).toBe(true);
    expect(intact.checks.blocked).toBe(false);
    expect(intact.checks.missing).toEqual([]);
    expect(intact.checks.drift).toEqual([]);

    await db
      .update(site)
      .set({ currentSnapshotId: null, status: "preview" })
      .where(eq(site.id, "site-1"));
    const body = decoder.decode(store.files.get(sourceKey)?.body);
    await store.put(
      sourceKey,
      encoder.encode(
        body
          .replace(`<p>${PARAGRAPH}</p>`, "")
          .replace('<img src="/img/heron.jpg" alt="Heron">', "")
      )
    );
    const blocked = await approveImport({
      db,
      store,
      siteId: "site-1",
      snapshotId: stored.snapshotId,
      host: "parks.localhost",
      hostMapPath: hostMap
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.checks.blocked).toBe(true);
    expect(blocked.checks.missing).toEqual([
      { page: "index.html", kind: "text", detail: `missing text "${PARAGRAPH}"` },
      { page: "index.html", kind: "image", detail: "missing image /img/heron.jpg" }
    ]);
    const afterBlock = await db.select().from(site).where(eq(site.id, "site-1"));
    expect(afterBlock[0]?.currentSnapshotId).toBeNull();
    expect(afterBlock[0]?.status).toBe("preview");
    const report = await db.select().from(importRun).where(eq(importRun.id, "run-1"));
    expect(report[0]?.fidelityReport).toMatchObject({
      publishChecks: [
        { page: "index.html", kind: "text", detail: `missing text "${PARAGRAPH}"` },
        { page: "index.html", kind: "image", detail: "missing image /img/heron.jpg" }
      ]
    });

    await store.put(sourceKey, encoder.encode(body));
    const live = await approveImport({
      db,
      store,
      siteId: "site-1",
      snapshotId: stored.snapshotId,
      host: "parks.localhost",
      hostMapPath: hostMap
    });
    expect(live.ok).toBe(true);
    expect(live.checks.missing).toEqual([]);

    await store.put(
      sourceKey,
      encoder.encode(
        body
          .replace(`<p>${PARAGRAPH}</p>`, "")
          .replace('<img src="/img/heron.jpg" alt="Heron">', "")
      )
    );
    const warned = await approveImport({
      db,
      store,
      siteId: "site-1",
      snapshotId: stored.snapshotId,
      host: "parks.localhost",
      hostMapPath: hostMap
    });
    expect(warned.ok).toBe(true);
    expect(warned.checks.blocked).toBe(false);
    expect(warned.checks.missing).toEqual([
      { page: "index.html", kind: "text", detail: `missing text "${PARAGRAPH}"` },
      { page: "index.html", kind: "image", detail: "missing image /img/heron.jpg" }
    ]);
    const afterWarn = await db.select().from(site).where(eq(site.id, "site-1"));
    expect(afterWarn[0]?.currentSnapshotId).toBe(stored.snapshotId);
    expect(afterWarn[0]?.status).toBe("live");
    await client.close();
  });

  it("goes live when a form still posts to the imported site, and keeps that list", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    await db.insert(account).values({ id: "acct-legacy", name: "Grove", slug: "grove" });
    await db.insert(site).values({
      id: "site-legacy",
      accountId: "acct-legacy",
      name: "Grove",
      slug: "grove",
      sourceUrl: "https://www.grove.co.uk",
      status: "importing"
    });
    await db.insert(importRun).values({
      id: "run-legacy",
      siteId: "site-legacy",
      sourceUrl: "https://www.grove.co.uk",
      status: "queued"
    });
    const bad = `<!doctype html><html><body><h1>Grove</h1>
<form action="https://forms.grove.co.uk/join" method="post"><input type="email" name="email"></form>
<form action="https://formspree.io/f/abc" method="post"><input type="email" name="email"></form>
<form action="https://other.co.uk/join" method="post"><button type="submit" formaction="https://grove.co.uk/save">Save</button></form>
<form action="/search" method="get"><input type="search" name="q"></form>
</body></html>`;
    const clean = `<!doctype html><html><body><h1>Grove</h1>
<form action="https://formspree.io/f/abc" method="post"><input type="email" name="email"></form>
<form action="http://localhost:3000/f/site-legacy/home-1" method="post"><input type="text" name="name"></form>
</body></html>`;
    const store = memoryStore();
    const hostMap = join(mkdtempSync(join(tmpdir(), "publish-legacy-")), "hostmap.json");
    const stored = await storeImport({
      db,
      store,
      siteId: "site-legacy",
      importRunId: "run-legacy",
      result: imported([{ path: "index.html", html: bad }])
    });
    const sourceKey = `snapshots/site-legacy/${stored.snapshotId}/src/index.html`;
    const noted = await db.select().from(importRun).where(eq(importRun.id, "run-legacy"));
    expect(legacyOf(noted[0]?.fidelityReport)).toEqual(LEGACY_HITS);
    const published = await approveImport({
      db,
      store,
      siteId: "site-legacy",
      snapshotId: stored.snapshotId,
      host: "grove.localhost",
      hostMapPath: hostMap
    });
    expect(published.ok).toBe(true);
    expect(published.checks.blocked).toBe(false);
    expect(published.checks.missing).toEqual([]);
    const live = await db.select().from(site).where(eq(site.id, "site-legacy"));
    expect(live[0]?.currentSnapshotId).toBe(stored.snapshotId);
    expect(live[0]?.status).toBe("live");
    const kept = await db.select().from(importRun).where(eq(importRun.id, "run-legacy"));
    expect(legacyOf(kept[0]?.fidelityReport)).toEqual(LEGACY_HITS);
    const reportText = JSON.stringify(kept[0]?.fidelityReport);
    expect(reportText).not.toContain("formspree.io");
    expect(reportText).not.toContain("other.co.uk");
    expect(reportText).not.toContain("publishChecks");

    await store.put(sourceKey, encoder.encode(clean));
    const clearedRun = await approveImport({
      db,
      store,
      siteId: "site-legacy",
      snapshotId: stored.snapshotId,
      host: "grove.localhost",
      hostMapPath: hostMap
    });
    expect(clearedRun.ok).toBe(true);
    expect(clearedRun.checks.blocked).toBe(false);
    const cleared = await db.select().from(importRun).where(eq(importRun.id, "run-legacy"));
    expect(cleared[0]?.fidelityReport).not.toMatchObject({ legacyForms: expect.anything() });
    await client.close();
  });
});
