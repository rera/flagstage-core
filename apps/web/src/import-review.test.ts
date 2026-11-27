import { describe, expect, it } from "vitest";

import {
  detectedHint,
  flagPagePaths,
  formatCount,
  PLUGIN_NOTE_BODY,
  PLUGIN_NOTE_HEADING,
  pluginFeatureNotes,
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
    expect(summary.pluginNotes).toEqual([]);
  });

  it("lists removed forms and leftover forms that still point at the old site", () => {
    const report = {
      forms: [
        {
          page: "/blog",
          kind: "search",
          detail: "A search form was removed. It posted to this site."
        },
        {
          page: "/account/",
          kind: "login",
          detail: "A login or password form was removed. It posted to this site."
        },
        {
          page: "news/index.html",
          kind: "comments",
          detail: "A comment form was removed. It posted to this site."
        },
        {
          page: "/shop",
          kind: "checkout",
          detail: "A cart, checkout, or payment form was removed. It posted to this site."
        },
        {
          page: "/apply",
          kind: "file-upload",
          detail: "A form with a file field was removed. It posted to this site."
        },
        {
          page: "/blog",
          kind: "search",
          detail: "A search form was removed. It posted to this site."
        },
        {
          page: "/contact",
          kind: "form",
          detail: 'Form "Form on /contact" was pointed at the site form endpoint.'
        },
        {
          page: "/visit",
          kind: "form",
          detail: "A form that posted to this site was removed."
        },
        {
          page: "/newsletter",
          kind: "external-form",
          detail: "A form that posts to another site was left unchanged."
        }
      ],
      plugins: [
        { page: "/events", kind: "calendar", detail: "A calendar plugin was found." },
        { page: "/blog", kind: "search", detail: "Site search does not run on a static snapshot." }
      ],
      legacyForms: [
        {
          page: "contact/index.html",
          kind: "form-action",
          detail: 'Form action "https://harbor.example/join" still points at the imported site.'
        },
        {
          page: "index.html",
          kind: "form-action",
          detail: 'Form action "/search" still points at the imported site.'
        },
        {
          page: "account/index.html",
          kind: "formaction",
          detail:
            'Button formaction "https://harbor.example/wp-login.php" still points at the imported site.'
        },
        {
          page: "shop/index.html",
          kind: "form-action",
          detail: 'Form action "/checkout" still points at the imported site.'
        },
        {
          page: "stories/note.html",
          kind: "form-action",
          detail: 'Form action "/wp-comments-post.php" still points at the imported site.'
        },
        {
          page: "jobs/index.html",
          kind: "formaction",
          detail:
            'Input formaction "https://harbor.example/upload" still points at the imported site.'
        }
      ]
    };
    expect(pluginFeatureNotes(report)).toEqual([
      "Search box on /",
      "Search box on /blog",
      "Sign-in form on /account",
      "Comment form on /news",
      "Comment form on /stories/note.html",
      "Checkout on /shop",
      "File upload form on /apply",
      "File upload form on /jobs",
      "Form on /contact"
    ]);
    expect(pluginFeatureNotes({})).toEqual([]);
    expect(pluginFeatureNotes(null)).toEqual([]);
    expect(PLUGIN_NOTE_HEADING).toBe("Some features need a plugin");
    expect(PLUGIN_NOTE_BODY).toBe(
      "We took these off your new site for now. They'll come back once the matching plugin is ready."
    );
    const summary = readImportSummary({
      stats: { pages: 1 },
      report,
      drift: null,
      skill: null,
      baseline: null,
      siteId: "site-1"
    });
    expect(summary.pluginNotes).toEqual(pluginFeatureNotes(report));
  });
});
