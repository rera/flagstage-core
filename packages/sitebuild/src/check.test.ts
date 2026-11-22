import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildSite } from "./build";
import { reviewPublish } from "./check";
import {
  BASELINE_PATH,
  coverBaseline,
  inventoryPages,
  normalizeNav,
  serializeBaseline
} from "./content";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

const HEADER = `<header class="site-header">
Grove header
<nav>
<a href="/">Home</a>
<a href="/news">News</a>
</nav>
</header>`;

const FOOTER = `<footer>Grove footer</footer>`;
const PARAGRAPH = "The north gate closes at dusk after the last tram.";

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

function sourcePage(active: string, main: string): string {
  return `<!doctype html><html><head><title>Page</title></head><body>
<!--#include virtual="/_inc/header.html" active="${active}" -->
${main}
<!--#include virtual="/_inc/footer.html" -->
</body></html>`;
}

function originalPage(active: string, main: string): string {
  const home = active === "/" ? `<a href="/" class="current">Home</a>` : `<a href="/">Home</a>`;
  const news =
    active === "/news"
      ? `<a href="/news" class="active" aria-current="page">News</a>`
      : `<a href="/news">News</a>`;
  return `<!doctype html><html><head><title>Page</title></head><body>
<header class="site-header">
Grove header
<nav>
${home}
${news}
</nav>
</header>
${main}
${FOOTER}
</body></html>`;
}

const HOME_MAIN = `<main><h1>Home</h1>
<p>${PARAGRAPH}</p>
<img src="/img/heron.jpg" alt="Heron">
</main>`;

const ABOUT_MAIN = `<main><h1>About</h1>
<p>The east meadow keeps a second paragraph for this page.</p>
</main>`;

function layClean(): { root: string; src: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), "publish-check-"));
  roots.push(root);
  const src = join(root, "src");
  const out = join(root, "out");
  write(src, "_inc/header.html", HEADER);
  write(src, "_inc/footer.html", FOOTER);
  write(src, "index.html", sourcePage("/", HOME_MAIN));
  write(src, "about/index.html", sourcePage("/news", ABOUT_MAIN));
  write(
    src,
    ".flagstage/drift.json",
    JSON.stringify(
      {
        version: 1,
        includes: [
          {
            virtual: "/_inc/header.html",
            sha256: "",
            placementSha256: "",
            placements: [
              { page: "about/index.html", active: "/news" },
              { page: "index.html", active: "/" }
            ]
          },
          {
            virtual: "/_inc/footer.html",
            sha256: "",
            placementSha256: "",
            placements: [{ page: "about/index.html" }, { page: "index.html" }]
          }
        ]
      },
      null,
      2
    )
  );
  const baseline = coverBaseline(
    inventoryPages([
      { path: "index.html", html: originalPage("/", HOME_MAIN) },
      { path: "about/index.html", html: originalPage("/news", ABOUT_MAIN) }
    ]),
    [],
    []
  );
  write(src, BASELINE_PATH, serializeBaseline(baseline));
  return { root, src, out };
}

describe("normalizeNav", () => {
  it("splices out the current-page marker and leaves the rest of the tag", () => {
    const html =
      '<a href="/" class="nav active" id="home" aria-current="page">Home</a><a class=\'current\' href="/news">News</a>';
    expect(normalizeNav(html)).toBe(
      '<a href="/" class="nav" id="home">Home</a><a href="/news">News</a>'
    );
  });
});

describe("publish checks", () => {
  it("passes a clean import when nav highlights differ", () => {
    const { src, out } = layClean();
    buildSite({ sourceDir: src, outputDir: out });
    const checks = reviewPublish({ sourceDir: src, outputDir: out, mode: "import" });
    expect(checks.blocked).toBe(false);
    expect(checks.drift).toEqual([]);
    expect(checks.missing).toEqual([]);
  });

  it("flags one page whose header copy was edited in place", () => {
    const { src, out } = layClean();
    const page = join(src, "about/index.html");
    const edited = HEADER.replace("Grove header", "Grove header today");
    writeFileSync(
      page,
      readFileSync(page, "utf8").replace(
        '<!--#include virtual="/_inc/header.html" active="/news" -->',
        edited
      )
    );
    buildSite({ sourceDir: src, outputDir: out });
    const checks = reviewPublish({ sourceDir: src, outputDir: out, mode: "import" });
    expect(checks.drift).toEqual([
      expect.objectContaining({
        page: "about/index.html",
        block: "header"
      })
    ]);
    expect(checks.drift[0]?.snippet).toContain("- Grove header");
    expect(checks.drift[0]?.snippet).toContain("+ Grove header today");
    expect(checks.missing).toContainEqual({
      page: "about/index.html",
      kind: "text",
      detail: 'missing text "Grove header"'
    });
    expect(checks.blocked).toBe(true);
  });

  it("warns when the header is inlined unchanged and does not block", () => {
    const { src, out } = layClean();
    const page = join(src, "about/index.html");
    const inlined = HEADER.replace(
      '<a href="/news">News</a>',
      '<a href="/news" class="active" aria-current="page">News</a>'
    );
    writeFileSync(
      page,
      readFileSync(page, "utf8").replace(
        '<!--#include virtual="/_inc/header.html" active="/news" -->',
        inlined
      )
    );
    buildSite({ sourceDir: src, outputDir: out });
    const checks = reviewPublish({ sourceDir: src, outputDir: out, mode: "import" });
    expect(checks.drift).toEqual([
      { page: "about/index.html", block: "header", snippet: "inlined unchanged" }
    ]);
    expect(checks.missing).toEqual([]);
    expect(checks.blocked).toBe(false);
  });

  it("does not flag an edit to the include file", () => {
    const { src, out } = layClean();
    const header = join(src, "_inc/header.html");
    writeFileSync(header, readFileSync(header, "utf8").replace("<header", '<header data-rev="2"'));
    buildSite({ sourceDir: src, outputDir: out });
    const checks = reviewPublish({ sourceDir: src, outputDir: out, mode: "import" });
    expect(checks.drift).toEqual([]);
    expect(checks.blocked).toBe(false);
    expect(checks.missing).toEqual([]);
  });

  it("blocks the first publish when a paragraph or an image is gone", () => {
    const { src, out } = layClean();
    const page = join(src, "index.html");
    writeFileSync(
      page,
      readFileSync(page, "utf8")
        .replace(`<p>${PARAGRAPH}</p>\n`, "")
        .replace('<img src="/img/heron.jpg" alt="Heron">\n', "")
    );
    buildSite({ sourceDir: src, outputDir: out });
    const checks = reviewPublish({ sourceDir: src, outputDir: out, mode: "import" });
    expect(checks.blocked).toBe(true);
    expect(checks.missing).toEqual([
      {
        page: "index.html",
        kind: "text",
        detail: `missing text "${PARAGRAPH}"`
      },
      { page: "index.html", kind: "image", detail: "missing image /img/heron.jpg" }
    ]);
  });

  it("warns on a later edit that deletes the same paragraph and image, and does not block", () => {
    const { src, out } = layClean();
    const previous = join(layClean().root, "out");
    buildSite({ sourceDir: src, outputDir: previous });
    const page = join(src, "index.html");
    writeFileSync(
      page,
      readFileSync(page, "utf8")
        .replace(`<p>${PARAGRAPH}</p>\n`, "")
        .replace('<img src="/img/heron.jpg" alt="Heron">\n', "")
    );
    const built = buildSite({ sourceDir: src, outputDir: out });
    const checks = reviewPublish({
      sourceDir: src,
      outputDir: out,
      previousDir: previous,
      diff: built.diff,
      mode: "later"
    });
    expect(checks.blocked).toBe(false);
    expect(checks.missing).toEqual([
      {
        page: "index.html",
        kind: "text",
        detail: `missing text "${PARAGRAPH}"`
      },
      { page: "index.html", kind: "image", detail: "missing image /img/heron.jpg" }
    ]);
  });

  it("stays quiet when a later edit only changes a short label", () => {
    const { src, out } = layClean();
    const previous = join(layClean().root, "out");
    buildSite({ sourceDir: src, outputDir: previous });
    const page = join(src, "index.html");
    writeFileSync(page, readFileSync(page, "utf8").replace("<h1>Home</h1>", "<h1>Homes</h1>"));
    const built = buildSite({ sourceDir: src, outputDir: out });
    const checks = reviewPublish({
      sourceDir: src,
      outputDir: out,
      previousDir: previous,
      diff: built.diff,
      mode: "later"
    });
    expect(checks.blocked).toBe(false);
    expect(checks.missing).toEqual([]);
  });

  it("does not treat a generated listing or a redirected pagination URL as lost", () => {
    const root = mkdtempSync(join(tmpdir(), "publish-check-list-"));
    roots.push(root);
    const src = join(root, "src");
    const out = join(root, "out");
    const article = `<!doctype html><html><head><title>Story</title></head><body>
<main><h1>Story</h1><p>${PARAGRAPH}</p></main>
</body></html>`;
    const crawledList = `<!doctype html><html><body><h1>News</h1><p>Old crawled list</p></body></html>`;
    write(src, "stories/1.html", article);
    write(out, "stories/1.html", article);
    write(out, "news/index.html", '<h1>Generated news</h1><a href="/stories/1.html">Story</a>');
    const baseline = coverBaseline(
      inventoryPages([
        { path: "stories/1.html", html: article },
        { path: "news/index.html", html: crawledList },
        { path: "news/page/2/index.html", html: crawledList }
      ]),
      ["news/index.html", "news/page/2/index.html"],
      [{ fromPath: "/news/page/2/", toPath: "/news/" }]
    );
    write(src, BASELINE_PATH, serializeBaseline(baseline));
    const checks = reviewPublish({ sourceDir: src, outputDir: out, mode: "import" });
    expect(checks.blocked).toBe(false);
    expect(checks.missing).toEqual([]);
  });

  it("warns when a later publish drops a page, and ignores a covered listing page", () => {
    const root = mkdtempSync(join(tmpdir(), "publish-check-drop-"));
    roots.push(root);
    const src = join(root, "src");
    const previous = join(root, "prev");
    const out = join(root, "out");
    write(previous, "about/index.html", "<h1>About</h1>");
    write(previous, "news/page/2/index.html", "<h1>Old page</h1>");
    write(out, "news/page/2/index.html", "<h1>Still here</h1>");
    const baseline = coverBaseline(
      inventoryPages([{ path: "news/page/2/index.html", html: "<h1>Old page</h1>" }]),
      ["news/page/2/index.html"],
      [{ fromPath: "/news/page/2/", toPath: "/news/" }]
    );
    write(src, BASELINE_PATH, serializeBaseline(baseline));
    const checks = reviewPublish({
      sourceDir: src,
      outputDir: out,
      previousDir: previous,
      diff: {
        changed: ["news/page/2/index.html"],
        removed: ["about/index.html"],
        unchanged: []
      },
      mode: "later"
    });
    expect(checks.blocked).toBe(false);
    expect(checks.missing).toEqual([
      { page: "about/index.html", kind: "page", detail: "page removed" }
    ]);
  });
});
