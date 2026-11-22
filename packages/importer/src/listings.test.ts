import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { bedrockListingDecide, type ListingDecide, type ListingDecision } from "@flagstage/ai";
import { buildSite, reviewPublish } from "@flagstage/sitebuild";
import { afterEach, describe, expect, it } from "vitest";

import { addBaseline } from "./baseline";
import { extractSharedBlocks, type CapturedFile, type ImportResult } from "./index";
import { LISTINGS_PATH, scaffoldSite } from "./templates";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function pageFile(path: string, html: string): CapturedFile {
  return { path, body: encoder.encode(html), contentType: "text/html; charset=utf-8" };
}

function imported(pages: CapturedFile[]): ImportResult {
  return {
    pages,
    assets: [],
    redirects: [{ fromPath: "/old", toPath: "/", source: "test" }],
    forms: [],
    report: { forms: [], plugins: [], missingAssets: [], cssBackgrounds: [], uncertain: [] },
    stats: { pages: pages.length, assets: 0 }
  };
}

const NAV = [
  ["/", "Home"],
  ["/news", "News"],
  ["/visit", "Visit"],
  ["/about", "About"]
] as const;

function header(active: string): string {
  const links = NAV.map(([href, label]) =>
    href === active
      ? `<a href="${href}" class="active" aria-current="page">${label}</a>`
      : `<a href="${href}">${label}</a>`
  ).join("");
  return `<header class="site-header">Grove header<nav>${links}</nav></header>`;
}

const FOOTER = `<footer class="site-footer">Grove footer for every page.</footer>`;

function shell(title: string, active: string, main: string, head = ""): string {
  return `<!doctype html><html lang="en"><head><title>${title}</title>${head}</head><body>${header(active)}${main}${FOOTER}</body></html>`;
}

function day(index: number): string {
  return new Date(Date.UTC(2020, 0, index)).toISOString().slice(0, 10);
}

function article(
  path: string,
  id: string,
  index: number,
  section: string,
  hrefActive: string
): CapturedFile {
  const data = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: `Story ${id}`,
    datePublished: day(index),
    articleSection: section,
    keywords: ["grove"],
    description: `Deck ${id}`
  });
  return pageFile(
    path,
    shell(
      `Story ${id}`,
      hrefActive,
      `<main><article><h1>Story ${id}</h1><p>Deck ${id}</p></article></main>`,
      `<script type="application/ld+json">${data}</script>`
    )
  );
}

function pager(prev: string | null, next: string | null, extra = ""): string {
  const older = prev ? `<a class="prev" rel="prev" href="${prev}">Older</a>` : "";
  const newer = next ? `<a class="next" rel="next" href="${next}">Newer</a>` : "";
  return `<nav class="page-nav">${older}${newer}${extra}</nav>`;
}

async function run(pages: CapturedFile[], decide?: ListingDecide) {
  let calls = 0;
  const wrapped: ListingDecide = decide
    ? async (summary) => {
        calls += 1;
        return decide(summary);
      }
    : async () => {
        calls += 1;
        throw new Error("decide should not be called");
      };
  const result = await scaffoldSite(extractSharedBlocks(imported(pages)), { decide: wrapped });
  return { result, calls };
}

function text(file: CapturedFile | undefined): string {
  return decoder.decode(file?.body ?? new Uint8Array());
}

function listingsOf(result: ImportResult): {
  pageSize: number;
  groups: Array<{ id: string; match: string; pageSize?: number; output: string; landing: string }>;
} {
  const file = result.pages.find((item) => item.path === LISTINGS_PATH);
  return JSON.parse(text(file)) as {
    pageSize: number;
    groups: Array<{
      id: string;
      match: string;
      pageSize?: number;
      output: string;
      landing: string;
    }>;
  };
}

function build(result: ImportResult): { src: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), "listing-import-"));
  roots.push(root);
  const src = join(root, "src");
  const out = join(root, "out");
  for (const file of result.pages) {
    const abs = join(src, file.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.body);
  }
  buildSite({ sourceDir: src, outputDir: out });
  return { src, out };
}

describe("measured listings", () => {
  it("measures a 10-per-page newest-first /news/page/N/ list", async () => {
    const pages: CapturedFile[] = [];
    for (let index = 1; index <= 25; index += 1) {
      pages.push(article(`stories/${index}.html`, String(index), index, "Newsroom", "/news"));
    }
    const card = (id: number) =>
      `<article class="story-card"><h2><a href="/stories/${id}">Story ${id}</a></h2><p class="dek">Deck ${id}</p></article>`;
    const list = (ids: number[], nav: string) =>
      pageFile(
        ids[0] === 25 ? "news/index.html" : `news/page/${ids[0] === 15 ? 2 : 3}/index.html`,
        shell("News", "/news", `<main><h1>News</h1>${ids.map(card).join("")}${nav}</main>`)
      );
    pages.push(
      list([25, 24, 23, 22, 21, 20, 19, 18, 17, 16], pager("/news/page/2/", null)),
      list([15, 14, 13, 12, 11, 10, 9, 8, 7, 6], pager("/news/page/3/", "/news/")),
      list([5, 4, 3, 2, 1], pager(null, "/news/page/2/")),
      pageFile(
        "notes/index.html",
        shell("Notes", "/about", `<main><h1>Notes</h1>${[1, 2, 3].map(card).join("")}</main>`)
      )
    );

    const { result, calls } = await run(pages);
    expect(calls).toBe(0);
    const listings = listingsOf(result);
    expect(listings.pageSize).toBe(10);
    expect(listings.groups.map((group) => group.match)).toEqual(["all"]);
    expect(listings.groups[0]?.pageSize).toBe(10);
    expect(listings.groups[0]?.output).toBe("/news/page/{n}.html");
    expect(listings.groups[0]?.landing).toBe("/news/index.html");

    const template = text(result.pages.find((file) => file.path === "_templates/listing.html"));
    expect(template).toContain('class="story-card"');
    expect(template).toContain('class="dek"');
    expect(template).toContain("<!--#listing item -->");
    expect(template).toContain('href="{{url}}"');
    expect(template).toContain("{{heading}}");
    expect(template).toContain('class="page-nav"');
    expect(template).toContain(">Older<");
    expect(template).toContain('href="{{prev}}"');
    expect(template).toContain('href="{{next}}"');
    expect(template).toContain('<!--#include virtual="/_inc/header.html"');
    expect(template).not.toContain("Story 15");
    expect((template.match(/class="story-card"/g) ?? []).length).toBe(1);

    const paths = result.pages.map((file) => file.path);
    expect(paths).not.toContain("news/index.html");
    expect(paths).not.toContain("news/page/2/index.html");
    expect(paths).not.toContain("news/page/3/index.html");
    expect(paths).toContain("notes/index.html");
    expect(paths).toContain("stories/1.html");
    expect(result.redirects).toEqual(
      expect.arrayContaining([
        { fromPath: "/old", toPath: "/", source: "test" },
        { fromPath: "/news/page/2/", toPath: "/news/", source: "listing" },
        { fromPath: "/news/page/3/", toPath: "/news/", source: "listing" }
      ])
    );
    expect(result.redirects.some((redirect) => redirect.fromPath === "/news/")).toBe(false);
    expect(
      result.report.uncertain.some(
        (item) => item.page === "notes/index.html" && item.kind === "listing"
      )
    ).toBe(true);

    const checked = addBaseline(
      result,
      pages.map((file) => ({ path: file.path, html: text(file) }))
    );
    const reviewed = build(checked);
    const checks = reviewPublish({
      sourceDir: reviewed.src,
      outputDir: reviewed.out,
      mode: "import"
    });
    expect(checks.blocked).toBe(false);
    expect(checks.missing).toEqual([]);

    const { out } = build(result);
    const news = readFileSync(join(out, "news/index.html"), "utf8");
    expect(news).toContain("Grove header");
    expect(news).toContain("Grove footer");
    expect(news).not.toContain("<!--#include");
    expect(news).toContain('class="story-card"');
    expect(news).toContain('href="/stories/25.html"');
    expect(news.indexOf("/stories/25.html")).toBeLessThan(news.indexOf("/stories/21.html"));
    expect(news).not.toContain('href="/stories/20.html"');
  });

  it("measures a 50-per-page oldest-first ?page=N list", async () => {
    const pages: CapturedFile[] = [];
    for (let index = 1; index <= 107; index += 1) {
      pages.push(article(`stories/${index}.html`, String(index), index, "Archive", "/archive"));
    }
    const card = (id: number) =>
      `<li class="entry"><a href="/stories/${id}">Story ${id}</a><p class="kicker">Deck ${id}</p></li>`;
    const slice = (start: number, count: number) => {
      const ids: number[] = [];
      for (let id = start + count - 1; id >= start; id -= 1) ids.push(id);
      return ids;
    };
    const add = (
      number: number,
      start: number,
      count: number,
      prev: number | null,
      next: number | null
    ) => {
      pages.push(
        pageFile(
          `archive/index.html?page=${number}`,
          shell(
            "Archive",
            "/archive",
            `<main><h1>Archive</h1><ul class="entries">${slice(start, count).map(card).join("")}</ul>${pager(
              prev ? `/archive/?page=${prev}` : null,
              next ? `/archive/?page=${next}` : null
            )}</main>`
          )
        )
      );
    };
    add(1, 1, 50, null, 2);
    add(2, 51, 50, 1, 3);
    add(3, 101, 7, 2, null);

    const { result, calls } = await run(pages);
    expect(calls).toBe(0);
    const listings = listingsOf(result);
    expect(listings.pageSize).toBe(50);
    expect(listings.groups[0]?.pageSize).toBe(50);
    expect(listings.groups[0]?.output).toBe("/archive/page/{n}.html");
    expect(listings.groups[0]?.landing).toBe("/archive/index.html");
    const template = text(result.pages.find((file) => file.path === "_templates/listing.html"));
    expect(template).toContain('class="entry"');
    expect(template).toContain('class="kicker"');
    expect(template).toContain("{{heading}}");
    expect(template).toContain('class="page-nav"');
    expect((template.match(/class="entry"/g) ?? []).length).toBe(1);
    expect(result.pages.some((file) => file.path.includes("?page="))).toBe(false);
    expect(result.redirects).toEqual(
      expect.arrayContaining([
        { fromPath: "/archive/?page=1", toPath: "/archive/page/1.html", source: "listing" },
        { fromPath: "/archive/?page=2", toPath: "/archive/page/2.html", source: "listing" },
        { fromPath: "/archive/?page=3", toPath: "/archive/page/3.html", source: "listing" }
      ])
    );

    const { out } = build(result);
    const first = readFileSync(join(out, "archive/page/1.html"), "utf8");
    expect(first).toContain("Grove header");
    expect(first).toContain("Grove footer");
    expect(first).not.toContain("<!--#include");
    expect(first).toContain('class="entry"');
    expect(first.indexOf("/stories/50.html")).toBeLessThan(first.indexOf("/stories/1.html"));
    expect(first).not.toContain("/stories/51.html");
  });

  it("asks decide when page sizes disagree and keeps a valid low-confidence reply", async () => {
    const pages = mixedPages();
    const { result, calls } = await run(pages, async () => ({
      pageSize: 12,
      itemSelector: "li.post",
      urlPattern: "/mixed/page/{n}/",
      order: "newest-first",
      group: "all",
      confidence: 0.4,
      reason: "sizes disagree"
    }));
    expect(calls).toBe(1);
    expect(listingsOf(result).groups[0]?.pageSize).toBe(12);
    const template = text(result.pages.find((file) => file.path === "_templates/listing.html"));
    expect(template).toContain('class="post"');
    expect(template).toContain("{{heading}}");
    expect(template).toContain('class="bit"');
    const note = result.report.uncertain.find(
      (item) => item.kind === "listing" && item.detail.includes("Low-confidence")
    );
    expect(note?.detail).toContain("sizes disagree");
    expect(note?.detail).toContain("li.post");
  });

  it("falls back when the model reply is impossible or the model throws", async () => {
    const pages = mixedPages();
    const invalid = await run(pages, async () => ({
      pageSize: 99,
      itemSelector: "li.post",
      urlPattern: "/mixed/page/{n}/",
      order: "newest-first",
      group: "all",
      confidence: 0.9,
      reason: "too big"
    }));
    expect(invalid.calls).toBe(1);
    expect(listingsOf(invalid.result).pageSize).toBe(10);
    expect(
      invalid.result.report.uncertain.some((item) => item.detail.includes("did not match"))
    ).toBe(true);

    const thrown = await run(pages, async () => {
      throw new Error("bedrock down");
    });
    expect(thrown.calls).toBe(1);
    expect(listingsOf(thrown.result).pageSize).toBe(10);
    expect(thrown.result.report.uncertain.some((item) => item.detail.includes("unavailable"))).toBe(
      true
    );
  });

  it("uses the measured guess when the decision model is off", async () => {
    let sent = false;
    const decide = bedrockListingDecide({
      region: "us-east-1",
      settings: {
        decisionEnabled: false,
        decisionModel: { provider: "bedrock", modelId: "should-not-run" }
      },
      send: async () => {
        sent = true;
        return "{}";
      }
    });
    const { result, calls } = await run(mixedPages(), decide);
    expect(calls).toBe(1);
    expect(sent).toBe(false);
    expect(listingsOf(result).groups[0]?.pageSize).toBe(10);
    expect(
      result.report.uncertain.some((item) => item.detail.includes("Measurements disagreed"))
    ).toBe(true);
    expect(result.report.uncertain.some((item) => item.detail.includes("unavailable"))).toBe(false);
  });

  it("treats a reply as low confidence only below the stored threshold", async () => {
    const pages = mixedPages();
    const decision: ListingDecision = {
      pageSize: 12,
      itemSelector: "li.post",
      urlPattern: "/mixed/page/{n}/",
      order: "newest-first",
      group: "all",
      confidence: 0.4,
      reason: "sizes disagree"
    };
    const flagged = await run(pages, async () => decision);
    expect(
      flagged.result.report.uncertain.some((item) => item.detail.includes("Low-confidence"))
    ).toBe(true);

    const kept = await scaffoldSite(extractSharedBlocks(imported(pages)), {
      decide: async () => decision,
      confidenceThreshold: 0.3
    });
    expect(listingsOf(kept).groups[0]?.pageSize).toBe(12);
    expect(kept.report.uncertain.some((item) => item.detail.includes("Low-confidence"))).toBe(
      false
    );
  });

  it("maps a section list onto a {section} group", async () => {
    const pages: CapturedFile[] = [];
    for (let index = 1; index <= 4; index += 1) {
      pages.push(article(`city/${index}.html`, `c${index}`, index, "City", "/sections/city"));
    }
    for (let index = 1; index <= 4; index += 1) {
      pages.push(
        article(`sports/${index}.html`, `s${index}`, index + 10, "Sports", "/sections/sports")
      );
    }
    const card = (id: number) =>
      `<article class="city-card"><h2><a href="/city/${id}">City ${id}</a></h2></article>`;
    const list = (number: number, ids: number[], prev: string | null, next: string | null) =>
      pageFile(
        `sections/city/page/${number}/index.html`,
        shell(
          "City",
          "/sections/city",
          `<main><h1>City</h1>${ids.map(card).join("")}${pager(prev, next)}</main>`
        )
      );
    pages.push(
      list(1, [1, 2], null, "/sections/city/page/2/"),
      list(2, [3, 4], "/sections/city/page/1/", null)
    );

    const { result, calls } = await run(pages);
    expect(calls).toBe(0);
    const group = listingsOf(result).groups[0];
    expect(group?.match).toBe("section");
    expect(group?.pageSize).toBe(2);
    expect(group?.output).toBe("/sections/{section}/page/{n}/index.html");
    expect(group?.landing).toBe("/sections/{section}/index.html");
    const template = text(result.pages.find((file) => file.path === "_templates/listing.html"));
    expect(template).toContain('class="city-card"');
    expect(template).toContain("{{heading}}");
    expect(result.pages.some((file) => file.path.startsWith("sections/city/page/"))).toBe(false);
    expect(result.redirects.filter((redirect) => redirect.source === "listing")).toEqual([]);

    const { out } = build(result);
    const landing = readFileSync(join(out, "sections/city/index.html"), "utf8");
    expect(landing).toContain("Grove header");
    expect(landing).toContain("Grove footer");
    expect(landing).not.toContain("<!--#include");
    expect(landing).toContain('class="city-card"');
    expect(landing).toContain('href="/city/4.html"');
  });
});

function mixedPages(): CapturedFile[] {
  const pages: CapturedFile[] = [];
  for (let index = 1; index <= 30; index += 1) {
    pages.push(article(`stories/${index}.html`, String(index), index, "Mixed", "/mixed"));
  }
  const card = (id: number) =>
    `<li class="post"><a href="/stories/${id}">Story ${id}</a><span class="bit">a</span><span class="bit">b</span></li>`;
  const add = (path: string, ids: number[], prev: string | null, next: string | null) => {
    pages.push(
      pageFile(
        path,
        shell(
          "Mixed",
          "/mixed",
          `<main><h1>Mixed</h1><ul class="posts">${ids.map(card).join("")}</ul>${pager(prev, next, '<a href="?page=2">2</a>')}</main>`
        )
      )
    );
  };
  add("mixed/index.html", [30, 29, 28, 27, 26, 25, 24, 23], "/mixed/page/2/", null);
  add(
    "mixed/page/2/index.html",
    [22, 21, 20, 19, 18, 17, 16, 15, 14, 13],
    "/mixed/page/3/",
    "/mixed/"
  );
  add("mixed/page/3/index.html", [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], null, "/mixed/page/2/");
  return pages;
}
