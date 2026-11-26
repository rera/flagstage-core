import { describe, expect, it } from "vitest";

import {
  detectedHint,
  flagPagePaths,
  formatCount,
  readImportProgress,
  readImportSummary,
  sameOn,
  skippedPages,
  typePages
} from "./import-review";

const drift = JSON.stringify({
  version: 1,
  includes: [
    {
      virtual: "/_inc/footer.html",
      placements: [{ page: "index.html" }, { page: "boots/index.html" }, { page: "index.html" }]
    },
    {
      virtual: "/_inc/header.html",
      placements: [{ page: "index.html" }, { page: "boots/index.html" }]
    },
    {
      virtual: "/_inc/nav.html",
      placements: [{ page: "index.html" }]
    },
    {
      virtual: "/_inc/store-hours.html",
      placements: [{ page: "visit/index.html" }]
    }
  ]
});

const skill = `# Site

## Page types

- \`article\` — template \`_templates/article.html\`. 217 pages, including \`stories/01.html\`. A new article starts from that template.
- \`listing\` — template \`_templates/listing.html\`. 1 pages, including \`news/index.html\`. A new listing starts from that template.
- \`page\` — template \`_templates/page.html\`. 18 pages, including \`visit/index.html\`. A new page starts from that template.
`;

describe("import review", () => {
  it("reads crawl counts and a named stage", () => {
    expect(
      readImportProgress({
        pagesFound: 2140,
        pagesDone: 1847,
        skipped: [{ path: "/gone", reason: "HTTP 500" }]
      })
    ).toEqual({
      stage: "Copying pages",
      pagesFound: 2140,
      pagesDone: 1847,
      skipped: 1
    });
    expect(
      readImportProgress({
        stage: "Finding pages",
        pagesFound: 12,
        pagesDone: 0,
        skipped: 3
      })
    ).toMatchObject({ stage: "Finding pages", skipped: 3 });
    expect(readImportProgress({})).toEqual({
      stage: null,
      pagesFound: null,
      pagesDone: null,
      skipped: 0
    });
    expect(formatCount(2140)).toBe("2,140");
    expect(skippedPages(12)).toBe("Skipped 12 pages that could not be copied.");
    expect(skippedPages(1)).toBe("Skipped 1 page that could not be copied.");
  });

  it("counts pages, shared sections, page types, and one link per uncertain block", () => {
    const summary = readImportSummary({
      stats: { pages: 99, pagesFound: 99 },
      report: {
        uncertain: [
          {
            page: "jackets/index.html",
            kind: "drift",
            detail:
              "Left the footer.site-footer block inline. It is close to /_inc/footer.html but not an exact match after normalizing the current-page marker.",
            explanation:
              "This page's footer did not match the shared footer, so it stayed on the page."
          },
          {
            page: "coats/index.html",
            kind: "drift",
            detail:
              "Left the footer.site-footer block inline. It is close to /_inc/footer.html but not an exact match after normalizing the current-page marker.",
            explanation:
              "This page's footer did not match the shared footer, so it stayed on the page."
          },
          {
            page: "visit/index.html",
            kind: "near-duplicate",
            detail:
              "Left the div.widget block inline. Similar copies appear on most pages, and no copy is the same on most pages.",
            explanation: "Left the div.widget block inline. See /_inc/widget.html."
          }
        ]
      },
      drift,
      skill,
      baseline: JSON.stringify({
        version: 1,
        pages: [{ path: "index.html" }, { path: "boots/index.html" }, { path: "visit/index.html" }]
      }),
      siteId: "site-1",
      pagesHtml: new Map([
        ["coats/index.html", "<title>Women&#39;s jackets</title>"],
        ["visit/index.html", "<html><body><h1>Visit us</h1></body></html>"]
      ])
    });
    expect(summary.pages).toBe(3);
    expect(summary.sections.map((section) => [section.name, section.pages])).toEqual([
      ["Header", 2],
      ["Navigation", 1],
      ["Footer", 2],
      ["Store hours", 1]
    ]);
    expect(summary.pageTypes.map((type) => [type.name, typePages(type.pages)])).toEqual([
      ["Article", "217 pages"],
      ["Listing", "1 page"],
      ["Page", "18 pages"]
    ]);
    expect(sameOn(2140)).toBe("same on 2,140 pages");
    expect(summary.flags).toEqual([
      {
        detail: "This page's footer did not match the shared footer, so it stayed on the page.",
        pagePath: "coats/index.html",
        label: "Women's jackets",
        href: "/sites/site-1/live/coats"
      },
      {
        detail:
          "This page's section is a little different from the shared one, so we kept it on the page.",
        pagePath: "visit/index.html",
        label: "Visit us",
        href: "/sites/site-1/live/visit"
      }
    ]);
    expect(summary.flags.some((flag) => flag.detail.includes("site-footer"))).toBe(false);
    expect(summary.flags.some((flag) => flag.detail.includes("_inc"))).toBe(false);
    expect(
      flagPagePaths(
        summary.flags.length
          ? {
              uncertain: summary.flags.map((flag) => ({ page: flag.pagePath, detail: flag.detail }))
            }
          : {}
      )
    ).toEqual(["coats/index.html", "visit/index.html"]);
    expect(detectedHint("WordPress")).toBe(
      "WordPress was detected from this address. Change this if that's wrong."
    );
  });
});
