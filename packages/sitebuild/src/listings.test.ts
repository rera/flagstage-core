import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildSite, SiteBuildError } from "./index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function workspace(): { root: string; src: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), "sitebuild-listings-"));
  roots.push(root);
  const src = join(root, "src");
  mkdirSync(src);
  return { root, src, out: join(root, "out") };
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

function filesUnder(root: string): string[] {
  const rels: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile())
        rels.push(
          abs
            .slice(root.length + 1)
            .split("\\")
            .join("/")
        );
    }
  }
  rels.sort();
  return rels;
}

function buildError(run: () => void): SiteBuildError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SiteBuildError);
    if (error instanceof SiteBuildError) return error;
  }
  throw new Error("expected SiteBuildError");
}

const TEMPLATE = `<!doctype html>
<html lang="en">
<head><title>{{title}}</title></head>
<body>
<!--#include virtual="/_inc/header.html" active="{{path}}" -->
<main>
<h1>{{title}}</h1>
<!--#listing item -->
<a href="{{url}}" title="{{headline}}">{{headline}}</a><img alt="" src="{{image}}">
<!--#listing /item -->
<nav class="pager">
<!--#listing prev -->
<a rel="prev" href="{{prev}}">Previous</a>
<!--#listing /prev -->
<!--#listing next -->
<a rel="next" href="{{next}}">Next</a>
<!--#listing /next -->
</nav>
</main>
<!--#include virtual="/_inc/footer.html" -->
</body>
</html>
`;

const GROUPS = {
  pageSize: 2,
  template: "_templates/listing.html",
  groups: [
    {
      id: "all",
      match: "all",
      title: "News",
      output: "/news/page/{n}.html",
      landing: "/news/index.html",
      active: "/news"
    },
    {
      id: "section",
      match: "section",
      title: "{section}",
      output: "/sections/{section}/page/{n}.html",
      landing: "/sections/{section}/index.html"
    },
    {
      id: "tag",
      match: "tag",
      title: "{tag}",
      output: "/tags/{tag}/page/{n}.html",
      landing: "/tags/{tag}/index.html"
    }
  ]
};

function article(json: unknown): string {
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body><p>body</p></body></html>\n`;
}

describe("listings", () => {
  it("paginates oldest first, escapes titles, and stitches the shared chrome", () => {
    const { src, out } = workspace();
    write(src, "_inc/header.html", '<header>HEAD <a href="/news">News</a></header>\n');
    write(src, "_inc/footer.html", "<footer>FOOT</footer>\n");
    write(src, "_templates/listing.html", TEMPLATE);
    write(src, ".flagstage/listings.json", JSON.stringify(GROUPS));
    write(
      src,
      "a.html",
      article({
        "@type": "NewsArticle",
        headline: 'Tom & Jerry <script> "quoted"',
        datePublished: "2020-01-01",
        articleSection: "City Desk",
        keywords: ["alpha"],
        description: "Alpha body"
      })
    );
    write(
      src,
      "b.html",
      article({
        "@type": "BlogPosting",
        headline: "Bee",
        datePublished: "2020-01-02T00:00:00Z",
        articleSection: "City Desk",
        keywords: ["alpha"]
      })
    );
    write(
      src,
      "c.html",
      article({
        "@type": "WebPage",
        mainEntity: {
          "@type": "Article",
          headline: "Cee",
          datePublished: "2020-01-03",
          articleSection: "City Desk",
          keywords: ["alpha"]
        }
      })
    );
    write(
      src,
      "d.html",
      article({
        "@type": "NewsArticle",
        headline: "Dee",
        datePublished: "2020-01-03",
        articleSection: "city desk",
        keywords: "alpha"
      })
    );
    write(
      src,
      "meta.html",
      `<!doctype html><html><head>
<meta property="og:title" content="From &amp; meta">
<meta content="2020-01-04" property="article:published_time">
<meta property="article:section" content="City Desk">
<meta property="article:tag" content="alpha">
<meta property="article:tag" content="walks">
</head><body></body></html>`
    );
    write(
      src,
      "e.html",
      article({
        "@type": "NewsArticle",
        headline: "Ee",
        datePublished: "2020-01-05",
        articleSection: "City Desk",
        keywords: ["alpha"]
      })
    );
    write(
      src,
      "graph.html",
      article({
        "@graph": [
          {
            "@type": "NewsArticle",
            headline: "From graph",
            datePublished: "2020-01-06",
            articleSection: "City Desk",
            keywords: "alpha, beta",
            description: "Graph body",
            image: "https://cdn.example/a.png"
          }
        ]
      })
    );
    write(
      src,
      "skip.html",
      "<html><head><title>Skip me</title></head><body>NOT-LISTED</body></html>"
    );
    const before = filesUnder(src);
    const first = buildSite({ sourceDir: src, outputDir: out });
    expect(filesUnder(src)).toEqual(before);
    const again = buildSite({ sourceDir: src, outputDir: out, previous: first.manifest });
    expect(again.diff.changed).toEqual([]);
    expect(again.diff.removed).toEqual([]);

    const landing = readFileSync(join(out, "news/index.html"), "utf8");
    const newest = readFileSync(join(out, "news/page/4.html"), "utf8");
    expect(landing).toBe(newest);
    expect(landing).toContain("HEAD");
    expect(landing).toContain("FOOT");
    expect(landing).toContain('<a href="/news" class="active" aria-current="page">');
    expect(landing).not.toContain("<!--#include");
    expect(landing).toContain('href="/graph.html"');
    expect(landing).toContain('src="https://cdn.example/a.png"');
    expect(landing).not.toContain("NOT-LISTED");
    expect(landing).toContain('rel="prev" href="/news/page/3.html"');
    expect(landing).not.toContain('rel="next"');

    const page1 = readFileSync(join(out, "news/page/1.html"), "utf8");
    const escaped = "Tom &amp; Jerry &lt;script&gt; &quot;quoted&quot;";
    expect(page1).toContain(`>${escaped}</a>`);
    expect(page1).toContain(`title="${escaped}"`);
    expect(page1).not.toContain("<script>");
    expect(page1.indexOf('href="/b.html"')).toBeLessThan(page1.indexOf('href="/a.html"'));
    expect(page1).toContain('rel="next" href="/news/page/2.html"');
    expect(page1).not.toContain('rel="prev"');

    const page2 = readFileSync(join(out, "news/page/2.html"), "utf8");
    expect(page2.indexOf('href="/d.html"')).toBeLessThan(page2.indexOf('href="/c.html"'));
    const page3 = readFileSync(join(out, "news/page/3.html"), "utf8");
    expect(page3.indexOf('href="/e.html"')).toBeLessThan(page3.indexOf('href="/meta.html"'));
    expect(page3).toContain("From &amp; meta");

    const section = readFileSync(join(out, "sections/city-desk/index.html"), "utf8");
    expect(section).toContain("<h1>City Desk</h1>");
    expect(section).toContain('href="/graph.html"');
    const beta = readFileSync(join(out, "tags/beta/index.html"), "utf8");
    expect(beta).toContain('href="/graph.html"');
    expect(beta).not.toContain('href="/a.html"');
    expect(readFileSync(join(out, "tags/walks/index.html"), "utf8")).toContain('href="/meta.html"');
    expect(existsSync(join(out, "skip.html"))).toBe(true);
    expect(landing).not.toContain("skip.html");
  });

  it("updates the listing pages an edit or a delete changes, and drops a removed group", () => {
    const { src, out } = workspace();
    write(src, "_inc/header.html", "<header>HEAD</header>");
    write(src, "_inc/footer.html", "<footer>FOOT</footer>");
    write(src, "_templates/listing.html", TEMPLATE);
    const config = {
      pageSize: 2,
      template: "_templates/listing.html",
      groups: [
        {
          id: "all",
          match: "all",
          title: "News",
          output: "/news/page/{n}.html",
          landing: "/news/index.html",
          active: "/news"
        },
        {
          id: "tag",
          match: "tag",
          title: "{tag}",
          output: "/tags/{tag}/page/{n}.html",
          landing: "/tags/{tag}/index.html"
        }
      ]
    };
    write(src, ".flagstage/listings.json", JSON.stringify(config));
    for (const [name, day, tags] of [
      ["a", "01", ["grove", "solo"]],
      ["b", "02", ["grove"]],
      ["c", "03", ["grove"]],
      ["d", "04", ["grove"]],
      ["e", "05", ["grove"]]
    ] as const) {
      write(
        src,
        `${name}.html`,
        article({
          "@type": "NewsArticle",
          headline: name.toUpperCase(),
          datePublished: `2020-01-${day}`,
          keywords: tags
        })
      );
    }
    const first = buildSite({ sourceDir: src, outputDir: out });
    const page1 = readFileSync(join(out, "news/page/1.html"), "utf8");
    expect(page1.indexOf('href="/b.html"')).toBeLessThan(page1.indexOf('href="/a.html"'));
    expect(readFileSync(join(out, "news/index.html"), "utf8")).toContain('href="/e.html"');

    rmSync(join(src, "a.html"));
    const deleted = buildSite({ sourceDir: src, outputDir: out, previous: first.manifest });
    expect(deleted.diff.removed).toEqual([
      "a.html",
      "news/page/3.html",
      "tags/grove/page/3.html",
      "tags/solo/index.html",
      "tags/solo/page/1.html"
    ]);
    expect(deleted.diff.changed).toEqual([
      "news/index.html",
      "news/page/1.html",
      "news/page/2.html",
      "tags/grove/index.html",
      "tags/grove/page/1.html",
      "tags/grove/page/2.html"
    ]);
    expect(deleted.diff.unchanged).toEqual(["b.html", "c.html", "d.html", "e.html"]);
    const nextPage = readFileSync(join(out, "news/page/1.html"), "utf8");
    expect(nextPage.indexOf('href="/c.html"')).toBeLessThan(nextPage.indexOf('href="/b.html"'));
    expect(nextPage).not.toContain('href="/a.html"');
    expect(readFileSync(join(out, "news/index.html"), "utf8")).toBe(
      readFileSync(join(out, "news/page/2.html"), "utf8")
    );
    expect(readFileSync(join(out, "news/page/2.html"), "utf8")).toContain('href="/e.html"');
    expect(nextPage).toContain("HEAD");
    expect(nextPage).toContain("FOOT");
    expect(nextPage).not.toContain("<!--#include");

    write(
      src,
      ".flagstage/listings.json",
      JSON.stringify({ ...config, groups: config.groups.filter((group) => group.id === "all") })
    );
    const dropped = buildSite({ sourceDir: src, outputDir: out, previous: deleted.manifest });
    expect(dropped.diff.removed).toEqual([
      "tags/grove/index.html",
      "tags/grove/page/1.html",
      "tags/grove/page/2.html"
    ]);
    expect(dropped.diff.changed).toEqual([]);
  });

  it("uses a default template and ignores a site with no listing config", () => {
    const { src, out } = workspace();
    write(src, "_inc/header.html", "<header>HEAD</header>");
    write(src, "_inc/footer.html", "<footer>FOOT</footer>");
    write(src, "index.html", "<p>Home</p>");
    write(
      src,
      "story.html",
      article({ "@type": "NewsArticle", headline: "Only", datePublished: "2020-02-02" })
    );
    const plain = buildSite({ sourceDir: src, outputDir: out });
    expect(plain.files).toBe(2);
    expect(readFileSync(join(out, "story.html"), "utf8")).toContain("Only");

    write(
      src,
      ".flagstage/listings.json",
      JSON.stringify({
        groups: [
          {
            id: "all",
            match: "all",
            title: "News",
            output: "/news/page/{n}.html",
            landing: "/news/index.html"
          }
        ]
      })
    );
    buildSite({ sourceDir: src, outputDir: out });
    const news = readFileSync(join(out, "news/index.html"), "utf8");
    expect(news).toContain("HEAD");
    expect(news).toContain("FOOT");
    expect(news).toContain('href="/story.html"');
    expect(news).toContain("Only");
    expect(news).not.toContain("<!--#include");
    expect(filesUnder(src).some((rel) => rel.startsWith("news/"))).toBe(false);

    write(src, ".flagstage/listings.json", "{");
    const error = buildError(() => buildSite({ sourceDir: src, outputDir: out }));
    expect(error.code).toBe("bad-listings");
    write(
      src,
      ".flagstage/listings.json",
      JSON.stringify({ template: "../secret.html", groups: [] })
    );
    expect(buildError(() => buildSite({ sourceDir: src, outputDir: out })).code).toBe(
      "bad-listings"
    );
  });
});

const PAGE_COUNT = 5_000;
const PAGE_SIZE = 24;

describe("listing corpus", () => {
  it("keeps a new article on the newest page", () => {
    const { src, out } = workspace();
    write(src, "_inc/header.html", '<header>LIST_HEADER <a href="/news">News</a></header>\n');
    write(src, "_inc/footer.html", "<footer>LIST_FOOTER</footer>\n");
    write(src, "_templates/listing.html", TEMPLATE);
    write(
      src,
      ".flagstage/listings.json",
      JSON.stringify({
        pageSize: PAGE_SIZE,
        template: "_templates/listing.html",
        groups: GROUPS.groups
      })
    );
    write(src, "about/plain.html", "<p>NOT-LISTED</p>\n");
    write(src, "css/site.css", "body{margin:0}\n");
    const generatedAt = performance.now();
    for (let index = 0; index < PAGE_COUNT; index += 1) {
      const id = String(index).padStart(5, "0");
      write(src, `news/${id}.html`, corpusArticle(id, isoDay(index), `Story ${id}`));
    }
    const generateMs = performance.now() - generatedAt;
    const sourceBefore = filesUnder(src);

    const started = performance.now();
    const first = buildSite({ sourceDir: src, outputDir: out });
    const buildMs = performance.now() - started;
    expect(filesUnder(src)).toEqual(sourceBefore);

    const pageCount = Math.ceil(PAGE_COUNT / PAGE_SIZE);
    expect(pageCount).toBe(209);
    const listingFiles = pageCount * 3 + 3;
    expect(first.files).toBe(PAGE_COUNT + 2 + listingFiles);
    expect(first.stitched).toBe(PAGE_COUNT + listingFiles);
    const landing = readFileSync(join(out, "news/index.html"), "utf8");
    expect(landing).toBe(readFileSync(join(out, `news/page/${pageCount}.html`), "utf8"));
    expect(landing).toContain("LIST_HEADER");
    expect(landing).toContain("LIST_FOOTER");
    expect(landing).toContain('<a href="/news" class="active" aria-current="page">');
    expect(landing).not.toContain("<!--#include");
    expect(landing).not.toContain("NOT-LISTED");
    expect(landing.indexOf("/news/04999.html")).toBeLessThan(landing.indexOf("/news/04992.html"));
    const oldest = readFileSync(join(out, "news/page/1.html"), "utf8");
    expect(oldest.indexOf("/news/00023.html")).toBeLessThan(oldest.indexOf("/news/00000.html"));
    expect(oldest).not.toContain("<!--#include");

    const before = urls(PAGE_COUNT);
    const after = urls(PAGE_COUNT + 1);
    const oldestChanged = changedPageNumbers(pagesOf(before, false), pagesOf(after, false));
    const oldestLanding = pagesOf(before, false).at(-1) !== pagesOf(after, false).at(-1);
    const expectedAdd = [...groupKeys(oldestChanged, oldestLanding), "news/05000.html"].sort();
    const newestBefore = pagesOf(before, true);
    const newestAfter = pagesOf(after, true);
    const baseline =
      3 *
        (changedPageNumbers(newestBefore, newestAfter).length +
          (newestBefore[0] !== newestAfter[0] ? 1 : 0)) +
      1;

    write(src, "news/05000.html", corpusArticle("05000", isoDay(PAGE_COUNT), "Story 05000"));
    const addedAt = performance.now();
    const added = buildSite({ sourceDir: src, outputDir: out, previous: first.manifest });
    const addedMs = performance.now() - addedAt;
    expect(added.diff.removed).toEqual([]);
    expect(added.diff.changed).toEqual(expectedAdd);
    expect(added.diff.changed.length).toBeLessThanOrEqual(10);
    expect(added.diff.changed.length).toBeLessThan(baseline);
    expect(added.diff.unchanged).toContain("news/page/1.html");
    expect(added.diff.unchanged).toContain("news/page/208.html");
    expect(added.diff.unchanged).toContain("css/site.css");
    expect(added.diff.unchanged).toContain("about/plain.html");

    const story = join(src, "news/00000.html");
    writeFileSync(
      story,
      readFileSync(story, "utf8").replaceAll("Story 00000", "Story 00000 & revised")
    );
    const edited = buildSite({ sourceDir: src, outputDir: out, previous: added.manifest });
    expect(edited.diff.changed).toEqual([
      "news/00000.html",
      "news/page/1.html",
      "sections/news/page/1.html",
      "tags/grove/page/1.html"
    ]);
    expect(edited.diff.removed).toEqual([]);
    const editedPage = readFileSync(join(out, "news/page/1.html"), "utf8");
    expect(editedPage).toContain("Story 00000 &amp; revised");
    expect(editedPage).not.toContain("Story 00000 & revised");
    expect(readFileSync(join(out, "news/index.html"), "utf8")).not.toContain("revised");

    rmSync(join(src, "news/05000.html"));
    const removed = buildSite({ sourceDir: src, outputDir: out, previous: edited.manifest });
    expect(removed.diff.removed).toEqual(["news/05000.html"]);
    expect(removed.diff.changed).toEqual(groupKeys([pageCount], true).sort());
    expect(removed.diff.unchanged).toContain("news/00000.html");
    expect(removed.diff.unchanged).toContain("news/page/1.html");
    const restored = readFileSync(join(out, "news/index.html"), "utf8");
    expect(restored).toContain("/news/04999.html");
    expect(restored).not.toContain("/news/05000.html");

    console.log(
      `listings ${PAGE_COUNT}: generate ${generateMs.toFixed(0)}ms, build ${buildMs.toFixed(0)}ms, one new article ${addedMs.toFixed(0)}ms changes ${added.diff.changed.length} files`
    );
    console.log(added.diff.changed.join("\n"));
    console.log(`newest-first baseline: ${baseline} files`);
    console.log(
      `edit oldest headline: ${edited.diff.changed.length} files; delete newest: ${removed.diff.removed.length} removed, ${removed.diff.changed.length} changed`
    );
    expect(buildMs, `full listing build took ${buildMs.toFixed(0)}ms`).toBeLessThan(15_000);
    expect(addedMs, `one-article rebuild took ${addedMs.toFixed(0)}ms`).toBeLessThan(15_000);
  }, 120_000);
});

function corpusArticle(id: string, date: string, headline: string): string {
  const data = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    datePublished: date,
    articleSection: "News",
    keywords: ["grove"],
    description: `Body ${id}`
  });
  return `<!doctype html>
<html lang="en">
<head><script type="application/ld+json">${data}</script></head>
<body>
<!--#include virtual="/_inc/header.html" active="/news" -->
<main><article><h1>${headline}</h1><p>Body ${id}</p></article></main>
<!--#include virtual="/_inc/footer.html" -->
</body>
</html>
`;
}

function isoDay(index: number): string {
  return new Date(Date.UTC(2020, 0, 1) + index * 86_400_000).toISOString().slice(0, 10);
}

function urls(count: number): string[] {
  return Array.from(
    { length: count },
    (_item, index) => `/news/${String(index).padStart(5, "0")}.html`
  );
}

function pagesOf(list: string[], newestFirst: boolean): string[] {
  const ordered = newestFirst ? [...list].reverse() : list;
  const pages: string[] = [];
  for (let index = 0; index < ordered.length; index += PAGE_SIZE) {
    const slice = ordered.slice(index, index + PAGE_SIZE);
    const shown = newestFirst ? slice : [...slice].reverse();
    pages.push(shown.join("|"));
  }
  return pages;
}

function changedPageNumbers(before: string[], after: string[]): number[] {
  const total = Math.max(before.length, after.length);
  const pages: number[] = [];
  for (let index = 0; index < total; index += 1) {
    if (before[index] !== after[index]) pages.push(index + 1);
  }
  return pages;
}

function groupKeys(pageNumbers: number[], landingChanged: boolean): string[] {
  const keys: string[] = [];
  for (const number of pageNumbers) {
    keys.push(`news/page/${number}.html`);
    keys.push(`sections/news/page/${number}.html`);
    keys.push(`tags/grove/page/${number}.html`);
  }
  if (landingChanged) {
    keys.push("news/index.html", "sections/news/index.html", "tags/grove/index.html");
  }
  return keys;
}
