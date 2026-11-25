import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import type { BlobStore, StoredObject } from "@flagstage/storage";

import { captureFileKey, saveProgress } from "./capture";
import { crawlSite, type CrawlOptions } from "./crawl";
import { parseRobots } from "./discover";
import type { Fetched, PageFetch } from "./types";

const TEXT = new TextDecoder();

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

function html(body: string): Fetched {
  return {
    status: 200,
    body: new TextEncoder().encode(body),
    contentType: "text/html; charset=utf-8"
  };
}

function text(body: string, contentType: string): Fetched {
  return { status: 200, body: new TextEncoder().encode(body), contentType };
}

function bytes(body: Uint8Array, contentType: string): Fetched {
  return { status: 200, body, contentType };
}

const caps = { maxPages: 20, maxDepth: 2, maxAssets: 20 };

function crawl(
  partial: Omit<CrawlOptions, "appOrigin" | "siteId" | "caps"> & { caps?: CrawlOptions["caps"] }
) {
  return crawlSite({
    appOrigin: "http://localhost:3000",
    siteId: "site-1",
    caps,
    concurrency: 2,
    hostIntervalMs: 0,
    ...partial
  });
}

describe("robots.txt", () => {
  it("lets the longest allow win and prefers the crawler group over *", () => {
    const star = parseRobots(`User-agent: *\nDisallow: /docs\nAllow: /docs/public\n`);
    expect(star.allowed("/docs/secret")).toBe(false);
    expect(star.allowed("/docs/public")).toBe(true);
    expect(star.allowed("/docs/public/page")).toBe(true);
    expect(star.allowed("/about")).toBe(true);

    const specific = parseRobots(
      [
        "User-agent: *",
        "Disallow:",
        "User-agent: FlagstageCrawler",
        "Disallow: /members",
        "Allow: /members/public"
      ].join("\n")
    );
    expect(specific.allowed("/members")).toBe(false);
    expect(specific.allowed("/members/public")).toBe(true);
    expect(specific.allowed("/news")).toBe(true);
    expect(specific.sitemaps).toEqual([]);
  });
});

describe("public crawler discovery", () => {
  it("reads a sitemap index, a gzip nested sitemap, and /sitemap.xml, and skips robots disallows", async () => {
    const origin = "https://golf.example";
    const nested = `<urlset>
      <url><loc>${origin}/news</loc></url>
      <url><loc>${origin}/blocked</loc></url>
      <url><loc>${origin}/tour</loc></url>
    </urlset>`;
    const requested: string[] = [];
    const stages: string[] = [];
    let pagesFound = 0;
    let pagesProcessed = 0;
    const result = await crawl({
      sourceUrl: origin,
      seeds: ["/"],
      fetchPage: async (url) => {
        const parsed = new URL(url);
        requested.push(parsed.pathname);
        if (parsed.pathname === "/robots.txt") {
          return text(
            [
              "User-agent: *",
              "Disallow: /blocked",
              "Sitemap: https://cdn.example/sitemap.xml",
              `Sitemap: ${origin}/maps/index.xml`
            ].join("\n"),
            "text/plain"
          );
        }
        if (parsed.pathname === "/maps/index.xml") {
          return text(
            `<sitemapindex><sitemap><loc>${origin}/maps/pages.xml.gz</loc></sitemap></sitemapindex>`,
            "application/xml"
          );
        }
        if (parsed.pathname === "/maps/pages.xml.gz") {
          return bytes(gzipSync(Buffer.from(nested)), "application/gzip");
        }
        if (parsed.pathname === "/sitemap.xml") {
          return text(
            `<urlset><url><loc>${origin}/from-root</loc></url></urlset>`,
            "application/xml"
          );
        }
        if (parsed.pathname === "/") {
          return html(
            `<!doctype html><a href="${origin}/news">News</a><a href="/not-in-sitemap">Extra</a>`
          );
        }
        if (
          parsed.pathname === "/news" ||
          parsed.pathname === "/tour" ||
          parsed.pathname === "/from-root"
        ) {
          return html(`<!doctype html><p>${parsed.pathname}</p>`);
        }
        if (parsed.pathname === "/blocked" || parsed.pathname === "/not-in-sitemap") {
          return html("<p>should not fetch</p>");
        }
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      },
      onProgress: (progress) => {
        if (progress.stage) stages.push(progress.stage);
        pagesFound = progress.pagesFound;
        pagesProcessed = progress.pagesProcessed ?? pagesProcessed;
      }
    });

    expect(requested).toContain("/robots.txt");
    expect(requested).toContain("/maps/index.xml");
    expect(requested).toContain("/maps/pages.xml.gz");
    expect(requested).toContain("/sitemap.xml");
    expect(requested).not.toContain("/blocked");
    expect(requested).not.toContain("/not-in-sitemap");
    expect(requested.some((path) => path.startsWith("/wp-"))).toBe(false);
    expect(result.pages.map((file) => file.path).sort()).toEqual([
      "from-root/index.html",
      "index.html",
      "news/index.html",
      "tour/index.html"
    ]);
    const home = TEXT.decode(result.pages.find((file) => file.path === "index.html")?.body);
    expect(home).toContain('href="/news"');
    expect(home).toContain(`href="${origin}/not-in-sitemap"`);
    expect(home).not.toContain('href="/not-in-sitemap"');
    expect(stages).toContain("discovering");
    expect(stages).toContain("crawling");
    expect(stages).toContain("rewriting");
    expect(pagesFound).toBe(4);
    expect(pagesProcessed).toBe(4);
    expect(result.stats).toMatchObject({ stage: "rewriting", pagesProcessed: 4, pagesDone: 4 });
  });

  it("does not fetch a path disallowed for FlagstageCrawler and still follows links when no sitemap exists", async () => {
    const origin = "https://club.example";
    const requested: string[] = [];
    const result = await crawl({
      sourceUrl: origin,
      fetchPage: async (url) => {
        const path = new URL(url).pathname;
        requested.push(path);
        if (path === "/robots.txt") {
          return text(
            [
              "User-agent: *",
              "Disallow:",
              "User-agent: FlagstageCrawler",
              "Disallow: /members"
            ].join("\n"),
            "text/plain"
          );
        }
        if (path === "/")
          return html(`<a href="/calendar">Calendar</a><a href="/members">Members</a>`);
        if (path === "/calendar") return html("<p>calendar</p>");
        if (path === "/members") return html("<p>secret</p>");
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    });
    expect(requested).toContain("/calendar");
    expect(requested).not.toContain("/members");
    expect(requested).not.toContain("/sitemap_index.xml");
    expect(result.pages.map((file) => file.path).sort()).toEqual([
      "calendar/index.html",
      "index.html"
    ]);
    expect(result.redirects).toEqual([]);
  });

  it("imports an explicit URL list and does not crawl the sitemap", async () => {
    const origin = "https://list.example";
    const requested: string[] = [];
    const result = await crawl({
      sourceUrl: origin,
      urls: [`${origin}/only`, "/two", "https://other.example/skip", ""],
      fetchPage: async (url) => {
        const path = new URL(url).pathname;
        requested.push(path);
        if (path === "/robots.txt") {
          return text("User-agent: FlagstageCrawler\nDisallow: /two/private\n", "text/plain");
        }
        if (path === "/sitemap.xml") {
          return text(
            `<urlset><url><loc>${origin}/from-sitemap</loc></url></urlset>`,
            "application/xml"
          );
        }
        if (path === "/" || path === "/only" || path === "/two" || path === "/from-sitemap") {
          return html(`<a href="${origin}/from-sitemap">More</a><p>${path}</p>`);
        }
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    });
    expect(requested).not.toContain("/sitemap.xml");
    expect(requested).not.toContain("/from-sitemap");
    expect(result.pages.map((file) => file.path).sort()).toEqual([
      "only/index.html",
      "two/index.html"
    ]);
  });
});

describe("public crawler streaming", () => {
  it("rewrites links to relative only for imported pages and assets", async () => {
    const origin = "https://rewrite.example";
    const store = memoryStore();
    const prefix = "imports/rewrite/";
    const result = await crawl({
      sourceUrl: origin,
      urls: [`${origin}/`, `${origin}/kept`],
      store,
      capturePrefix: prefix,
      fetchPage: async (url) => {
        const path = new URL(url).pathname;
        if (path === "/robots.txt")
          return { status: 404, body: new Uint8Array(), contentType: "text/plain" };
        if (path === "/") {
          return html(`<!doctype html>
            <a href="${origin}/kept">Kept</a>
            <a href="${origin}/other">Other</a>
            <a href="/other">Other rel</a>
            <a href="/kept#top">Kept hash</a>
            <img src="${origin}/logo.png">
            <img src="https://cdn.example/x.png">`);
        }
        if (path === "/kept") return html("<p>kept</p>");
        if (path === "/logo.png") return bytes(new Uint8Array([1, 2, 3]), "image/png");
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    });
    expect(result.pages.every((file) => file.body.byteLength === 0)).toBe(true);
    expect(result.assets.every((file) => file.body.byteLength === 0)).toBe(true);
    const home = TEXT.decode(store.files.get(captureFileKey(prefix, "index.html"))?.body);
    expect(home).toContain('href="/kept"');
    expect(home).toContain('href="/kept#top"');
    expect(home).toContain(`href="${origin}/other"`);
    expect(home).not.toContain('href="/other"');
    expect(home).toContain('src="/logo.png"');
    expect(home).toContain("https://cdn.example/x.png");
    expect(store.files.get(captureFileKey(prefix, "logo.png"))?.body).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("skips pages already recorded in the progress file", async () => {
    const origin = "https://resume.example";
    const store = memoryStore();
    const prefix = "imports/resume/";
    await saveProgress(store, prefix, {
      version: 1,
      origin,
      pages: ["/a"],
      assets: [],
      skipped: [],
      missingAssets: [],
      cssBackgrounds: []
    });
    await store.put(
      captureFileKey(prefix, "a/index.html"),
      new TextEncoder().encode("<p>a</p>"),
      "text/html; charset=utf-8"
    );
    const fetched: string[] = [];
    const fetchPage: PageFetch = async (url) => {
      const path = new URL(url).pathname;
      fetched.push(path);
      if (path === "/sitemap.xml") {
        return text(
          `<urlset>
            <url><loc>${origin}/a</loc></url>
            <url><loc>${origin}/b</loc></url>
            <url><loc>${origin}/c</loc></url>
          </urlset>`,
          "application/xml"
        );
      }
      if (path === "/b" || path === "/c") return html(`<p>${path}</p>`);
      if (path === "/") return html("<p>home</p>");
      return { status: 404, body: new Uint8Array(), contentType: "text/html" };
    };
    const first = await crawl({
      sourceUrl: origin,
      seeds: [],
      store,
      capturePrefix: prefix,
      caps: { maxPages: 10, maxDepth: 2, maxAssets: 5 },
      fetchPage
    });
    expect(fetched).toContain("/b");
    expect(fetched).toContain("/c");
    expect(fetched).not.toContain("/a");
    expect(first.pages.map((file) => file.path).sort()).toEqual([
      "a/index.html",
      "b/index.html",
      "c/index.html"
    ]);

    const again: string[] = [];
    await crawl({
      sourceUrl: origin,
      seeds: [],
      store,
      capturePrefix: prefix,
      caps: { maxPages: 10, maxDepth: 2, maxAssets: 5 },
      fetchPage: async (url) => {
        again.push(new URL(url).pathname);
        return fetchPage(url);
      }
    });
    expect(again).not.toContain("/a");
    expect(again).not.toContain("/b");
    expect(again).not.toContain("/c");
  });

  it("streams a few thousand pages without retaining their bytes", async () => {
    const origin = "https://large.example";
    const total = 5_000;
    const store = memoryStore();
    const prefix = "imports/large/";
    const concurrency = 6;
    let inFlight = 0;
    let peak = 0;
    let pageFetches = 0;
    let storedAtFetch200 = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const timer = setTimeout(release, 8_000);
    const locs = Array.from(
      { length: total },
      (_, index) => `<url><loc>${origin}/p/${index}</loc></url>`
    ).join("");
    const filler = "x".repeat(1024);
    const started = Date.now();
    const result = await crawl({
      sourceUrl: origin,
      seeds: [],
      store,
      capturePrefix: prefix,
      concurrency,
      caps: { maxPages: total + 10, maxDepth: 1, maxAssets: 1 },
      fetchPage: async (url) => {
        const path = new URL(url).pathname;
        if (path === "/robots.txt") {
          return text(`Sitemap: ${origin}/sitemap.xml\n`, "text/plain");
        }
        if (path === "/sitemap.xml") return text(`<urlset>${locs}</urlset>`, "application/xml");
        if (path === "/") return html("<p>home</p>");
        const match = path.match(/^\/p\/(\d+)$/);
        if (!match) return { status: 404, body: new Uint8Array(), contentType: "text/html" };
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        pageFetches += 1;
        if (pageFetches === 200) {
          storedAtFetch200 = [...store.files.keys()].filter((key) =>
            key.startsWith(`${prefix}files/`)
          ).length;
        }
        if (inFlight >= concurrency) release();
        await gate;
        inFlight -= 1;
        return html(`<!doctype html><title>${match[1]}</title><p>${filler}</p>`);
      }
    });
    clearTimeout(timer);
    const elapsed = Date.now() - started;
    const stored = [...store.files.keys()].filter((key) => key.startsWith(`${prefix}files/`));
    const retained = result.pages.reduce((sum, file) => sum + file.body.byteLength, 0);
    expect(result.pages).toHaveLength(total);
    expect(stored).toHaveLength(total);
    expect(retained).toBe(0);
    expect(peak).toBeGreaterThanOrEqual(concurrency);
    expect(peak).toBeLessThanOrEqual(concurrency);
    expect(storedAtFetch200).toBeGreaterThan(40);
    expect(elapsed).toBeLessThan(20_000);
    expect(store.files.has(`${prefix}progress.json`)).toBe(true);
  }, 30_000);
});
