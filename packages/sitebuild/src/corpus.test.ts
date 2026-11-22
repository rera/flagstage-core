import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildSite, reviewPublish } from "./index";
import { BASELINE_PATH, coverBaseline, inventoryPages, serializeBaseline } from "./content";

const PAGE_COUNT = 5_000;
/** The reference stitch of this size finished in a fraction of a second. */
const STITCH_BUDGET_MS = 2_000;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

describe("generated corpus", () => {
  it("stitches 5000 pages, and a header edit reaches every linked page", () => {
    const root = mkdtempSync(join(tmpdir(), "sitebuild-corpus-"));
    roots.push(root);
    const src = join(root, "src");
    const out = join(root, "out");
    mkdirSync(src);

    const generatedAt = performance.now();
    const sentence = "Shared chrome is stitched once at build time. ";
    const article = `<p>${sentence.repeat(12)}</p>\n`.repeat(4);
    write(
      src,
      "_inc/nav.html",
      '<nav class="site-nav" aria-label="Main">\n  <a href="/news">News</a>\n  <a href="/tickets">Tickets</a>\n</nav>\n'
    );
    write(
      src,
      "_inc/header.html",
      '<header class="site-header">\n  <!-- nav-rev-1 -->\n  <a class="logo" href="/">Home</a>\n  <!--#include virtual="/_inc/nav.html" -->\n</header>\n'
    );
    write(src, "_inc/footer.html", '<footer class="site-footer">Footer mark 2026</footer>\n');
    write(src, "_templates/article.html", "TEMPLATE_SECRET");
    write(src, ".flagstage/skills/site.md", "SKILL_SECRET");
    write(src, "news/_templates/hidden.html", "NESTED_TEMPLATE_SECRET");
    write(src, "about/plain.html", "<h1>Plain</h1>\n");
    write(src, "css/site.css", "body{margin:0}\n");
    write(src, "img/logo.svg", '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n');
    const pages: string[] = [];
    for (let i = 0; i < PAGE_COUNT; i += 1) {
      const id = String(i).padStart(5, "0");
      const rel = `news/${id}.html`;
      pages.push(rel);
      write(
        src,
        rel,
        `<!doctype html>\n<html lang="en">\n<body>\n<!--#include virtual="/_inc/header.html" active="/news" -->\n<main>\n<!-- article ${id} -->\n${article}</main>\n<!--#include virtual="/_inc/footer.html" -->\n</body>\n</html>\n`
      );
    }
    const generateMs = performance.now() - generatedAt;

    const stitch = () => {
      const started = performance.now();
      const result = buildSite({ sourceDir: src, outputDir: out });
      return { result, ms: performance.now() - started };
    };

    const first = stitch();
    const sample = readFileSync(join(out, "news/00000.html"), "utf8");
    expect(sample).toContain("<!-- nav-rev-1 -->");
    expect(sample).toContain('href="/news" class="active" aria-current="page"');
    expect(sample).toContain('<a href="/tickets">Tickets</a>');
    expect(sample).toContain("Footer mark 2026");
    expect(sample).not.toContain("<!--#include");
    expect(sample).not.toContain("TEMPLATE_SECRET");
    expect(sample).not.toContain("SKILL_SECRET");
    expect(first.result.stitched).toBe(PAGE_COUNT);
    expect(first.result.files).toBe(PAGE_COUNT + 3);
    expect(first.result.diff.changed).toHaveLength(PAGE_COUNT + 3);
    expect(existsSync(join(out, "_inc"))).toBe(false);
    expect(existsSync(join(out, "_templates"))).toBe(false);
    expect(existsSync(join(out, ".flagstage"))).toBe(false);
    expect(existsSync(join(out, "news", "_templates"))).toBe(false);
    const leaked = Object.keys(first.result.manifest.files).filter((key) =>
      key
        .split("/")
        .some((part) => part === "_inc" || part === "_templates" || part === ".flagstage")
    );
    expect(leaked).toEqual([]);

    const htmlPages = [...pages, "about/plain.html"];
    const baseline = coverBaseline(
      inventoryPages(
        htmlPages.map((rel) => ({ path: rel, html: readFileSync(join(out, rel), "utf8") }))
      ),
      [],
      []
    );
    write(src, BASELINE_PATH, serializeBaseline(baseline));
    write(
      src,
      ".flagstage/drift.json",
      JSON.stringify({
        version: 1,
        includes: [
          {
            virtual: "/_inc/header.html",
            sha256: "",
            placementSha256: "",
            placements: pages.map((page) => ({ page, active: "/news" }))
          },
          {
            virtual: "/_inc/footer.html",
            sha256: "",
            placementSha256: "",
            placements: pages.map((page) => ({ page }))
          }
        ]
      })
    );
    const reviewStarted = performance.now();
    const reviewed = reviewPublish({ sourceDir: src, outputDir: out, mode: "import" });
    const reviewMs = performance.now() - reviewStarted;
    expect(reviewed.blocked).toBe(false);
    expect(reviewed.missing).toEqual([]);
    expect(reviewed.drift).toEqual([]);
    expect(reviewMs, `import review took ${reviewMs.toFixed(0)}ms`).toBeLessThan(2_000);
    const previousOut = join(root, "prev");
    cpSync(out, previousOut, { recursive: true });

    const headerPath = join(src, "_inc/header.html");
    writeFileSync(headerPath, readFileSync(headerPath, "utf8").replace("nav-rev-1", "nav-rev-2"));
    const secondStarted = performance.now();
    const second = buildSite({
      sourceDir: src,
      outputDir: out,
      previous: first.result.manifest
    });
    const secondMs = performance.now() - secondStarted;
    expect(second.diff.changed).toEqual(pages);
    expect(second.diff.unchanged).toEqual(["about/plain.html", "css/site.css", "img/logo.svg"]);
    expect(second.diff.removed).toEqual([]);
    const laterStarted = performance.now();
    const later = reviewPublish({
      sourceDir: src,
      outputDir: out,
      previousDir: previousOut,
      diff: second.diff,
      mode: "later"
    });
    const laterMs = performance.now() - laterStarted;
    expect(later.blocked).toBe(false);
    expect(later.missing).toEqual([]);
    expect(later.drift).toEqual([]);
    console.log(
      `publish checks ${PAGE_COUNT} pages: import ${reviewMs.toFixed(0)}ms, later ${laterMs.toFixed(0)}ms`
    );
    expect(laterMs, `later review took ${laterMs.toFixed(0)}ms`).toBeLessThan(2_000);

    const checkedAt = performance.now();
    let missed = 0;
    for (const rel of pages) {
      const html = readFileSync(join(out, rel), "utf8");
      if (
        !html.includes("nav-rev-2") ||
        html.includes("nav-rev-1") ||
        html.includes("<!--#include") ||
        !html.includes('href="/news" class="active" aria-current="page"') ||
        !html.includes("Footer mark 2026")
      ) {
        missed += 1;
      }
    }
    const checkMs = performance.now() - checkedAt;
    expect(missed).toBe(0);
    expect(readFileSync(join(out, "about/plain.html"), "utf8")).toBe("<h1>Plain</h1>\n");
    expect(readFileSync(join(out, "about/plain.html"), "utf8")).not.toContain("nav-rev-2");

    const target = pages[100];
    if (target === undefined) throw new Error("corpus page missing");
    const targetPath = join(src, target);
    writeFileSync(
      targetPath,
      readFileSync(targetPath, "utf8").replace(
        "<!-- article 00100 -->",
        "<!-- article 00100 updated -->"
      )
    );
    const thirdStarted = performance.now();
    const third = buildSite({ sourceDir: src, outputDir: out, previous: second.manifest });
    const thirdMs = performance.now() - thirdStarted;
    expect(third.diff.changed).toEqual([target]);
    expect(third.diff.removed).toEqual([]);
    expect(third.diff.unchanged).toHaveLength(PAGE_COUNT + 2);
    expect(readFileSync(join(out, target), "utf8")).toContain("<!-- article 00100 updated -->");
    expect(readFileSync(join(out, target), "utf8")).not.toContain("<!--#include");

    console.log(
      `sitebuild ${PAGE_COUNT} pages: generate ${generateMs.toFixed(0)}ms, stitch ${first.ms.toFixed(0)}ms, header edit ${secondMs.toFixed(0)}ms, one page ${thirdMs.toFixed(0)}ms, verify ${checkMs.toFixed(0)}ms, import review ${reviewMs.toFixed(0)}ms, later review ${laterMs.toFixed(0)}ms`
    );
    expect(first.ms, `full stitch took ${first.ms.toFixed(0)}ms`).toBeLessThan(STITCH_BUDGET_MS);
    expect(secondMs, `header restitch took ${secondMs.toFixed(0)}ms`).toBeLessThan(
      STITCH_BUDGET_MS
    );
    expect(thirdMs, `one-page restitch took ${thirdMs.toFixed(0)}ms`).toBeLessThan(
      STITCH_BUDGET_MS
    );
  }, 60_000);
});
