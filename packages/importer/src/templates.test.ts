import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { buildSite } from "@flagstage/sitebuild";
import { afterEach, describe, expect, it } from "vitest";

import { extractSharedBlocks, type CapturedFile, type ImportResult } from "./index";
import {
  DRIFT_MANIFEST_PATH,
  LISTINGS_PATH,
  scaffoldSite,
  SITE_SKILL_PATH,
  type DriftManifest
} from "./templates";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function text(file: CapturedFile | undefined): string {
  return decoder.decode(file?.body ?? new Uint8Array());
}

function pageFile(path: string, html: string): CapturedFile {
  return { path, body: encoder.encode(html), contentType: "text/html; charset=utf-8" };
}

function imported(pages: CapturedFile[]): ImportResult {
  return {
    pages,
    assets: [
      { path: "img/logo.svg", body: encoder.encode("<svg></svg>"), contentType: "image/svg+xml" }
    ],
    redirects: [{ fromPath: "/old", toPath: "/", source: "test" }],
    forms: [{ formKey: "hello", name: "Hello", page: "/" }],
    report: {
      forms: [],
      plugins: [],
      missingAssets: [],
      cssBackgrounds: [],
      uncertain: []
    },
    stats: { pages: pages.length, assets: 1 }
  };
}

const NAV = [
  ["/", "Home"],
  ["/news", "News"],
  ["/visit", "Visit"],
  ["/about", "About"],
  ["/hours", "Hours"],
  ["/membership", "Membership"],
  ["/events", "Events"]
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

function cards(count: number): string {
  const items = [];
  for (let index = 1; index <= count; index += 1) {
    const id = String(index).padStart(2, "0");
    items.push(`<article><h2>Card ${id}</h2><a href="/stories/${id}">Read ${id}</a></article>`);
  }
  return items.join("");
}

interface Sample {
  path: string;
  active: string;
  group: "article" | "listing" | "page" | "variant" | "unique";
  html: string;
}

function corpus(): Sample[] {
  const pages: Sample[] = [
    {
      path: "index.html",
      active: "/",
      group: "listing",
      html: shell("Home", "/", `<main><h1>Home</h1>${cards(6)}</main>`)
    },
    {
      path: "news/index.html",
      active: "/news",
      group: "listing",
      html: shell("News", "/news", `<main><h1>News</h1>${cards(4)}</main>`)
    }
  ];
  for (let index = 1; index <= 8; index += 1) {
    const id = String(index).padStart(2, "0");
    const klass = index % 2 === 0 ? "post" : "story";
    pages.push({
      path: `stories/${id}.html`,
      active: "/news",
      group: "article",
      html: shell(
        `Story ${id}`,
        "/news",
        `<main><article class="${klass}"><h1>Story ${id}</h1><p>Story ${id} tells one visit to the grove.</p></article></main>`,
        `<meta property="og:title" content="Story ${id}"><meta property="article:published_time" content="2020-01-${id}"><meta property="article:section" content="Grove"><meta property="article:tag" content="grove">`
      )
    });
  }
  for (const id of ["v1", "v2"]) {
    pages.push({
      path: `stories/${id}.html`,
      active: "/news",
      group: "variant",
      html: shell(
        `Variant ${id}`,
        "/news",
        `<main><article><h1>Variant ${id}</h1><p>Variant body ${id}.</p><aside><p>Variant aside ${id} should stay inline.</p></aside></article></main>`
      )
    });
  }
  for (const name of ["visit", "about", "hours", "membership"]) {
    const title = name[0]?.toUpperCase() + name.slice(1);
    pages.push({
      path: `${name}/index.html`,
      active: `/${name}`,
      group: "page",
      html: shell(
        title,
        `/${name}`,
        `<main><h1>${title}</h1><p>${title} intro for this grove page.</p><p>Second paragraph for ${title}.</p></main>`
      )
    });
  }
  pages.push({
    path: "events/index.html",
    active: "/events",
    group: "unique",
    html: shell(
      "Events",
      "/events",
      `<main><table><tr><th>Event</th><th>Day</th></tr><tr><td>Concert on Friday</td><td>Friday</td></tr></table></main>`
    )
  });
  return pages;
}

function byPath(files: CapturedFile[]): Map<string, string> {
  return new Map(files.map((file) => [file.path, text(file)]));
}

describe("page types", () => {
  it("writes one template per detected type, a site skill, and a drift manifest", async () => {
    const samples = corpus();
    const source = imported(samples.map((page) => pageFile(page.path, page.html)));
    const once = await scaffoldSite(extractSharedBlocks(source));
    const twice = await scaffoldSite(extractSharedBlocks(source));
    expect(twice.pages.map((file) => [file.path, text(file)])).toEqual(
      once.pages.map((file) => [file.path, text(file)])
    );
    expect(once.assets).toEqual(source.assets);
    expect(once.redirects).toEqual(source.redirects);
    expect(once.forms).toEqual(source.forms);
    expect(once.stats).toEqual(source.stats);

    const files = byPath(once.pages);
    const templates = [...files.keys()].filter((path) => path.startsWith("_templates/")).sort();
    expect(templates).toEqual([
      "_templates/article.html",
      "_templates/listing.html",
      "_templates/page.html"
    ]);
    expect(files.has("_templates/article-2.html")).toBe(false);

    const article = files.get("_templates/article.html") ?? "";
    expect(article).toContain('<!--#include virtual="/_inc/header.html" active="{{path}}" -->');
    expect(article).toContain('<!--#include virtual="/_inc/footer.html" -->');
    expect(article).toContain("<h1>{{title}}</h1>");
    expect(article).toContain("<p>{{text}}</p>");
    expect(article).not.toContain("<aside");
    expect(article).not.toContain("tells one visit");
    expect(article).not.toContain("Variant aside");
    expect((article.match(/<article/g) ?? []).length).toBe(1);

    const listing = files.get("_templates/listing.html") ?? "";
    expect(listing).toContain('active="{{path}}"');
    expect(listing).toContain("<h1>{{title}}</h1>");
    expect(listing).toContain("{{url}}");
    expect(listing).toContain("{{heading}}");
    expect(listing).toContain("<!--#listing item -->");
    expect(listing).toContain("<!--#listing /item -->");
    expect(listing).toContain('rel="prev" href="{{prev}}"');
    expect(listing).toContain('rel="next" href="{{next}}"');
    expect((listing.match(/<!--#listing item -->/g) ?? []).length).toBe(1);
    expect((listing.match(/<article/g) ?? []).length).toBe(1);
    expect(listing).not.toContain("Card ");
    expect(listing).not.toContain("Read ");

    const generic = files.get("_templates/page.html") ?? "";
    expect(generic).toContain("<h1>{{title}}</h1>");
    expect(generic).toContain("<p>{{text}}</p>");
    expect(generic).not.toContain("<article");
    expect(generic).not.toContain("intro for this grove page");
    expect(generic).not.toContain("Concert on Friday");

    for (const sample of samples) {
      const page = files.get(sample.path) ?? "";
      expect(page).toContain(
        `<!--#include virtual="/_inc/header.html" active="${sample.active}" -->`
      );
      expect(page).toContain('<!--#include virtual="/_inc/footer.html" -->');
      expect(page).not.toContain("{{title}}");
      if (sample.group === "article") expect(page).toContain("tells one visit to the grove");
      if (sample.group === "variant") expect(page).toContain("should stay inline");
      if (sample.group === "unique") expect(page).toContain("Concert on Friday");
    }

    const skill = files.get(SITE_SKILL_PATH) ?? "";
    expect(skill).toContain("name: site");
    expect(skill).toContain("`/_inc/header.html` — site header.");
    expect(skill).toContain("Holds: Grove header");
    expect(skill).toContain("Links: /, /news, /visit, /about, /hours, /membership, /events.");
    expect(skill).toContain("`/_inc/footer.html` — site footer.");
    expect(skill).toContain("Holds: Grove footer for every page.");
    expect(skill).toContain("`article` — template `_templates/article.html`. 8 pages");
    expect(skill).toContain("including `stories/01.html`");
    expect(skill).toContain("A new article starts from that template.");
    expect(skill).toContain("`listing` — template `_templates/listing.html`. 2 pages");
    expect(skill).toContain("`page` — template `_templates/page.html`. 4 pages");
    expect(skill).toContain("A new page of a type starts from that type's template.");
    expect(skill).toContain("3 pages did not match these templates.");
    expect(skill).toContain(
      "A site-wide change must be done by writing a script and doing a dry run before applying. The dry run shows the count of matching pages and a sample diff. Apply the script only after that dry run. Never hand-edit many files."
    );
    expect(skill).not.toContain("_inc/nav.html");
    expect(skill).toContain(".flagstage/listings.json");
    expect(skill).toContain("Page 1 is the oldest page.");
    expect(skill).toContain('`"pageSize": 10` on the news group shows 10 per page.');
    const listings = JSON.parse(files.get(LISTINGS_PATH) ?? "") as {
      pageSize: number;
      template: string;
      groups: Array<{ match: string; output: string; landing: string }>;
    };
    expect(listings.pageSize).toBe(24);
    expect(listings.template).toBe("_templates/listing.html");
    expect(listings.groups.map((group) => group.match)).toEqual(["all", "section", "tag"]);
    expect(listings.groups[0]?.output).toBe("/news/page/{n}.html");
    expect(listings.groups[0]?.landing).toBe("/news/index.html");
    expect(listings.groups[2]?.output).toBe("/tags/{tag}/page/{n}.html");

    const manifest = JSON.parse(files.get(DRIFT_MANIFEST_PATH) ?? "") as DriftManifest;
    expect(manifest.version).toBe(1);
    expect(manifest.includes.map((item) => item.virtual)).toEqual([
      "/_inc/footer.html",
      "/_inc/header.html"
    ]);
    const headerInclude = once.pages.find((file) => file.path === "_inc/header.html");
    const headerEntry = manifest.includes.find((item) => item.virtual === "/_inc/header.html");
    expect(headerEntry?.sha256).toBe(
      createHash("sha256")
        .update(headerInclude?.body ?? new Uint8Array())
        .digest("hex")
    );
    expect(headerEntry?.placements).toHaveLength(samples.length);
    expect(text(headerInclude)).toContain("Grove header");
    expect(text(headerInclude)).not.toContain("aria-current");
    const expected = [...samples].sort((a, b) => a.path.localeCompare(b.path));
    expect(headerEntry?.placements).toEqual(
      expected.map((page) => ({ page: page.path, active: page.active }))
    );
    const lines = expected.map((page) => `${page.path}\t${page.active}`).join("\n");
    expect(headerEntry?.placementSha256).toBe(createHash("sha256").update(lines).digest("hex"));
    const footerEntry = manifest.includes.find((item) => item.virtual === "/_inc/footer.html");
    expect(footerEntry?.placements).toEqual(expected.map((page) => ({ page: page.path })));
    expect(footerEntry?.placements.every((item) => item.active === undefined)).toBe(true);

    const root = mkdtempSync(join(tmpdir(), "page-types-"));
    roots.push(root);
    const src = join(root, "src");
    const out = join(root, "out");
    for (const file of once.pages) {
      const abs = join(src, file.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.body);
    }
    buildSite({ sourceDir: src, outputDir: out });
    const built = readFileSync(join(out, "stories/01.html"), "utf8");
    expect(built).toContain("Grove header");
    expect(built).toContain('<a href="/news" class="active" aria-current="page">');
    expect(built).not.toContain('<a href="/" class="active"');
    expect(built).toContain("Story 01 tells one visit to the grove.");
    expect(built).not.toContain("<!--#include");
    const visit = readFileSync(join(out, "visit/index.html"), "utf8");
    expect(visit).toContain('<a href="/visit" class="active" aria-current="page">');
    expect(visit).not.toContain('<a href="/news" class="active"');
    expect(visit).not.toContain("<!--#include");
    const home = readFileSync(join(out, "index.html"), "utf8");
    expect(home).not.toContain("Never hand-edit");
    expect(home).not.toContain("{{title}}");
    expect(home).toContain('<a href="/" class="active" aria-current="page">');
    expect(files.get(SITE_SKILL_PATH)).toContain("Never hand-edit many files.");
    const news = readFileSync(join(out, "news/index.html"), "utf8");
    expect(news).toBe(readFileSync(join(out, "news/page/1.html"), "utf8"));
    expect(news).toContain("Grove header");
    expect(news).toContain("Grove footer");
    expect(news).toContain('<a href="/news" class="active" aria-current="page">');
    expect(news).not.toContain("<!--#include");
    expect(news).not.toContain("{{heading}}");
    expect(news).not.toContain('rel="prev"');
    expect(news.indexOf("/stories/08.html")).toBeLessThan(news.indexOf("/stories/01.html"));
    const tag = readFileSync(join(out, "tags/grove/index.html"), "utf8");
    expect(tag).toContain("Grove header");
    expect(tag).toContain("/stories/08.html");
    expect(tag).not.toContain("<!--#include");
    expect(readFileSync(join(src, "news/index.html"), "utf8")).toContain("<!--#include");
    expect(existsSync(join(out, ".flagstage"))).toBe(false);
  });

  it("leaves a one-page import without a template", async () => {
    const result = await scaffoldSite(
      extractSharedBlocks(
        imported([
          pageFile(
            "index.html",
            "<!doctype html><html><body><main><h1>Only</h1><p>Just this page.</p></main></body></html>"
          )
        ])
      )
    );
    expect(result.pages.some((file) => file.path.startsWith("_templates/"))).toBe(false);
    expect(result.pages.some((file) => file.path.startsWith("_inc/"))).toBe(false);
    const skill = text(result.pages.find((file) => file.path === SITE_SKILL_PATH));
    expect(skill).toContain("No shared include was extracted.");
    expect(skill).toContain("No page type was shared by enough pages to template.");
    expect(skill).toContain("Never hand-edit many files.");
    expect(skill).not.toContain("listings.json");
    expect(result.pages.some((file) => file.path === LISTINGS_PATH)).toBe(false);
    const manifest = JSON.parse(
      text(result.pages.find((file) => file.path === DRIFT_MANIFEST_PATH))
    ) as DriftManifest;
    expect(manifest).toEqual({ version: 1, includes: [] });
    expect(text(result.pages.find((file) => file.path === "index.html"))).toContain(
      "Just this page."
    );
  });
});
