# Write your own importer

An importer is a registered source. It has an id, a label, a detector, and a `run` function. `run` returns an `ImportResult`: pages, assets, redirects, forms, a fidelity report, and stats. `runImport` looks the id up in the registry, stores the result, and writes progress onto the import row.

When a run does not pass `source`, detection runs every detector against the entered URL and picks the best match. The public crawler is the fallback. Its id is `public` and its label is `Public website`. Its detector does not match a site, and it has no WordPress knowledge.

This repository ships two importers.

| Id          | Label          | Module                                         |
| ----------- | -------------- | ---------------------------------------------- |
| `public`    | Public website | `packages/importer/src/importers/public.ts`    |
| `wordpress` | WordPress      | `packages/importer/src/importers/wordpress.ts` |

A fork adds another source as a new module plus one `registerImporter` call in `packages/importer/src/registry.ts`. A Squarespace importer, for example, lives in that module. It supplies its own detector. The generic crawler stays generic.

## Register

```ts
import { registerImporter, type Importer, type ImportResult } from "@flagstage/importer";

export const acme: Importer = {
  id: "acme",
  label: "Acme",
  async detect(url, fetchPage) {
    const origin = new URL(url);
    origin.pathname = "/";
    origin.search = "";
    origin.hash = "";
    const response = await fetchPage(new URL("/acme.json", origin).toString());
    if (!response || response.status >= 400) return null;
    const body = new TextDecoder().decode(response.body);
    if (!body.includes('"acme"')) return null;
    return { match: true, confidence: 0.9, evidence: "The site served /acme.json." };
  },
  async run(options) {
    await options.onProgress?.({ pagesFound: 1, pagesDone: 0, skipped: [] });
    const result: ImportResult = {
      pages: [
        {
          path: "index.html",
          body: new TextEncoder().encode("<!doctype html><title>Acme</title>"),
          contentType: "text/html; charset=utf-8"
        }
      ],
      assets: [],
      redirects: [],
      forms: [],
      report: { forms: [], plugins: [], missingAssets: [], cssBackgrounds: [], uncertain: [] },
      stats: { pages: 1, assets: 0, pagesFound: 1, pagesDone: 1, skipped: [] }
    };
    await options.onProgress?.({ pagesFound: 1, pagesDone: 1, skipped: [] });
    return result;
  }
};

registerImporter(acme);
```

Call `registerImporter` in the process that runs the import, and import that module before `runImport`. The built-in importers register when `@flagstage/importer` loads. With no cluster set, the web process runs the import. With `ECS_CLUSTER` and `IMPORT_TASK_DEFINITION` set, the import task is `apps/worker`. Registering an id that is already present replaces that source.

`runImport` takes an optional `source`. Leave it unset and detection chooses the importer. Pass an id to force one. These three call sites start a run today:

- `apps/web/src/dispatch.ts`
- `apps/worker/src/main.ts`
- `apps/cli/src/commands.ts`

```ts
await runImport({
  db,
  store,
  siteId,
  importRunId,
  sourceUrl,
  appOrigin,
  caps,
  source: "acme"
});
```

`listImporters()` returns the registered ids. `getImporter("acme")` returns the source `runImport` will call. `detectImporter(url, fetchPage)` returns the choice `{ id, label, confidence, evidence }`. `detectImporterAction` in `apps/web/src/detect-importer.ts` is that call for a signed-in user. The New site dialog calls it after an address is entered and submits the chosen id as `source`. A run with no `source` argument reads `options.source` on the import row, then detects.

## Detectors

`detect(url, fetchPage)` returns `{ match, confidence, evidence }` or null.

`fetchPage` reads one URL and returns `{ status, body, contentType }`, or null. `runImport` passes the same function the crawl uses. The default follows redirects and calls `fetch`. Return null when this importer does not recognize the site. Do not throw for a site of a different kind. A throw is treated as no match.

`match` is true only when this importer should run. `confidence` is a number. The highest confidence wins. Equal confidence is broken by id, alphabetically, so the result does not depend on registration order. `evidence` is one short sentence a person can read.

The public importer is not in that contest. When nothing matches, the choice is `public`, confidence 0, evidence `No importer recognized this site.`

The WordPress detector requests `/wp-json` on the origin of the entered URL. It matches when the body is a JSON object whose `namespaces` include `wp/v2`. A plain page, a 404, or some other JSON object does not match.

## Result

`pages` and `assets` are the snapshot files. `path` is the object key under the snapshot prefix, such as `index.html`, `about/index.html`, or `assets/logo.png`. `body` is the bytes. `contentType` is stored with the object. Pages are written first, then assets. A repeated path keeps the later write.

`redirects` are stored as 301 rows: `fromPath`, `toPath`, and `source`. `forms` are stored as lead forms: `formKey`, `name`, and `page`. A `formKey` that already exists for the site is left as it is.

`report` is the fidelity report.

| Field            | What it holds                                                       |
| ---------------- | ------------------------------------------------------------------- |
| `forms`          | `{ page, kind, detail }` for a form that was found                  |
| `plugins`        | `{ page, kind, detail }` for something left behind                  |
| `missingAssets`  | Paths that did not answer                                           |
| `cssBackgrounds` | Missing files that were referenced from CSS                         |
| `uncertain`      | `{ page, kind, detail, explanation? }` for a block left on the page |

Return the pages as imported. `runImport` extracts shared blocks after `run` returns. See [Shared blocks](#shared-blocks). Set `uncertain` to `[]` unless the source already knows about a block it left inline.

`stats.pages` and `stats.assets` are the totals stored on the import row when the run finishes. Also set `pagesFound`, `pagesDone`, and `skipped` (`{ path, reason }`). Overview reads those fields, and an optional `stage` string, while the import runs.

## Options and progress

`options` carries `sourceUrl`, `appOrigin`, `siteId`, and `caps`. `runImport` calls `readImportCaps`, which is the only place that chooses the page and asset caps. Those come from platform importer settings (defaults 5,000 and 20,000). `maxDepth` is the depth passed for the run (`IMPORT_MAX_DEPTH`).

`urls`, when set, is an explicit list of absolute URLs or same-origin paths to import.

`fetchPage` reads one URL and returns `{ status, body, contentType }`, or null. `runImport` sets it. The default follows redirects, sends `User-Agent: FlagstageCrawler`, and calls `fetch`. The public crawler and the WordPress importer both require it.

`store` and `capturePrefix` stream each captured file as it is fetched. `runImport` sets both. The progress file is `progress.json` under that prefix. A later run with the same prefix skips pages already listed there.

`onProgress` receives `{ stage, pagesFound, pagesDone, pagesProcessed, skipped }`. `stage` is `discovering`, `crawling`, or `rewriting`. `pagesProcessed` counts finished pages and matches `pagesDone`, which the current site page reads. `runImport` writes that object onto the import row and notifies the site page. Call it as the source makes progress. The final `stats` object replaces it when the run completes, so copy the same fields onto `stats`.

A thrown error fails the run. The message is stored on the import row, and the site status becomes `failed`. An unknown `source` fails the same way.

## The public crawler

`packages/importer/src/crawl.ts` is the generic crawl. `publicImporter` in `packages/importer/src/importers/public.ts` is the registered source. Its id is `public`. The type of a source is `Importer` in `packages/importer/src/interface.ts`. The result type is `ImportResult` in `packages/importer/src/types.ts`.

`crawlSite` is that source's `run`. It fetches `/robots.txt` and obeys `Disallow` for `FlagstageCrawler` (or `User-agent: *` when that group is the one that matches). It reads every `Sitemap:` line and `/sitemap.xml`, follows sitemap indexes and nested sitemaps, and gunzips `.gz` bodies. Those URLs are the page set, plus `/` when robots allows it. With no sitemap, it follows same-origin links from the seeds (default `/`) until a cap or `maxDepth` stops it. `urls` replaces that discovery. An explicit list does not also crawl the sitemap.

HTML is stored as `pages`. Other saved files are `assets`. A link to an imported page or asset is rewritten to a root-relative URL. A link to a page that was not imported stays absolute on the source origin. A form that collects a visitor's input is pointed at `{appOrigin}/f/{siteId}/{formKey}` and added to `forms`. The key is the page path plus the form's id, name, or position, so the same site imports to the same form. A form on a subdomain of the imported site is the same site, including a name under a multi-part suffix such as `.co.uk`. A form `annotatePage` already mapped is left to that importer. Search, login, comment, cart, checkout, payment, and file-upload forms on that site are removed and recorded as fidelity notes. Forms that post to another site are left in place and noted. A form inside an iframe embed is noted. The form endpoint stores text fields and does not store uploaded files. Site search markup is a fidelity note. Missing files are listed on the report. This crawler does not request WordPress URLs, and it does not record `/feed`, `/feed/`, `/index.php`, or `/?p=` redirects.

Workers default to 6 (`DEFAULT_CRAWL_CONCURRENCY`, clamped to 8) with 200ms between fetches to one host (`DEFAULT_HOST_INTERVAL_MS`). Those are code defaults. Pass `concurrency` or `hostIntervalMs` on `crawlSite` to override them. There is no environment variable for either.

When `store` is set, each file is written under `capturePrefix` as it is fetched and the result bodies are empty. `progress.json` next to those files lists the finished paths. A later `crawlSite` with the same prefix and origin skips them. Without `store`, the result still carries the bytes.

`crawlSite` accepts optional `seeds`, `redirects`, and `annotatePage`. A specialized importer uses those to add starting paths, redirects, and per-page notes, then returns the same `ImportResult`. The public importer passes none of them. `parseRobots`, `collectSitemapPages`, and `maybeGunzip` are the discovery helpers. The WordPress importer keeps its own seeds and can call the same helpers. It already gunzips the WordPress sitemap responses.

After each page it calls `onProgress` with the stage, pages found, pages processed, and any skipped path. An origin that does not answer throws `The site did not answer.` A crawl whose robots rules leave no allowed page throws `robots.txt disallows this crawl.`

`stats.pages` on this crawler counts pages visited, including a page that was skipped. `stats.assets` counts files saved as assets. `pages.length` is the HTML that was kept.

## The WordPress importer

`packages/importer/src/importers/wordpress.ts` registers id `wordpress` and label `WordPress`. It does not need a plugin on the WordPress site. It reads the public site and the public REST API, then calls `crawlSite`.

The run seeds `/` plus every same-origin URL in `/wp-sitemap.xml` and `/sitemap_index.xml`. It also seeds the first page of `/wp-json/wp/v2/pages` and `/wp-json/wp/v2/posts` (`per_page=100`). Each listed post or page with an id gets a redirect from `/?p=<id>` to that path. The run also records redirects from `/feed`, `/feed/`, and `/index.php` to `/`.

Contact Form 7 and Gravity Forms markup is mapped to lead forms. The generic form pass does not map those again. Other forms on the page are still picked up. Comment forms (`wp-comments-post`), login (`wp-login.php`), `tribe-events`, and `wp-calendar` are fidelity notes. The generic crawl still notes site search.

## Shared blocks

After `run` returns, `runImport` looks for blocks that repeat across the HTML pages: header, nav, footer, alert bar, newsletter, cookie banner, sidebar, and head tags that are the same on every page. Finding those blocks does not call a model.

A block is extracted only when the same bytes, after the current-page nav marker is removed, occur on more than half of the pages. The marker is `active`, `current`, `selected`, `is-active`, `is-current`, or `open` on a class, or an `aria-current` attribute. The block is written to `_inc/`, and the page span is replaced with:

```html
<!--#include virtual="/_inc/header.html" active="/news" -->
```

`active` is the href that had the marker. `@flagstage/sitebuild` puts `class="active" aria-current="page"` back on the first `<a href="/news">` when it builds the page. Other marker spellings are not written back. The publish check compares visible text, links, and images after splicing those markers out of the tags. It does not parse the page and write it back out.

A copy that is only close, or a cluster of similar copies where no one version is on most pages, stays in the page. `report.uncertain` lists it. `detail` is the internal note. One call to the importer decision model (Admin, Settings, Importer) then writes `explanation`, a single plain sentence for the site owner, for every flagged block together. The model id is the stored setting. There is no environment variable. When the model is off, missing, or the reply is not one plain sentence, `explanation` is `This page's {section} is a little different from the shared one, so we kept it on the page.` `{section}` is a plain name such as footer, header, sidebar, or navigation, and `section` when the block has no plain name. A miss is a missed include. The page is still the original bytes outside any span that was replaced.

One page is left unchanged. Files under `_inc/`, `_templates/`, and `.flagstage/` are not scanned. Assets, redirects, forms, and the other report fields are left as the source returned them.

## Page types

After extraction, `runImport` groups the pages by structure. Text and class names are ignored. A repeated row of the same child counts as one shape, so two listings of different lengths can match. A type is kept only when at least two pages share that shape. The names are `article` (one article with a heading), `listing` (a repeated row of links), and `page` (anything else). When two shapes would share a name, only the larger shape is kept.

Each kept type is written to `_templates/<type>.html`: the includes stay, `active` becomes `{{path}}`, a listing keeps one example item, and the text becomes `{{title}}`, `{{heading}}`, `{{text}}`, or `{{url}}`. A new page of that type starts from the template.

`.flagstage/skills/site/SKILL.md` names the includes, the page types, and the site-edit tools. Prefer an include when the same block is on many pages. `.flagstage/drift.json` records each include's sha256 and the pages that link it, including the `active` value. `.flagstage/baseline.json` records each original page's text, links, and images, and which crawled listing pages a generated list or a 301 replaces.

On the first Go live, a page that inlines or drops an include is reported as drift. Drift does not stop the publish. Missing text, links, images, or pages do. The site stays in preview, and the edit page lists what is missing. A later publish runs a smaller check against the previous public files (a removed page, a deleted image, or a large loss of text) and still goes live. The same list is kept on the import report, and a chat line is added when the site already has a thread. A form action or a button formaction that still resolves to the imported site is stored on the import report as `legacyForms`. Overview lists it with the removed forms. It does not stop Go live.

## Listings

When the import finds article pages, it writes `.flagstage/listings.json` and `_templates/listing.html`.

If the crawl has listing pages (a page that mostly links to dated articles, plus its paginated siblings), the file uses the measured page size for each group and that list's output paths. The template keeps the crawled item card and pager. Header and footer stay includes. A newest-first numbered URL whose articles would move is stored as a 301 to the landing page, and the crawled list is removed from the source. A list that is not covered stays as a normal page and is named in the fidelity report (`uncertain`, kind `listing`).

A list whose measurements disagree is sent to `decide` in `@flagstage/ai`. Which model runs, whether it runs, and the confidence threshold are the platform importer settings in the database. The default model is Claude Haiku 4.5 on Bedrock (`global.anthropic.claude-haiku-4-5-20251001-v1:0`). The default threshold is 0.6. A platform admin changes the settings. There is no environment variable. When the decision model is off, the measured guess is used. The reply is kept only when the page size and the item selector match the crawl. If the model is unavailable or the reply does not match, the measured guess is used and the report says the decision was low confidence.

If no list can be measured, the starter file uses page size 24 and paths `/news/page/{n}.html`, `/sections/{section}/page/{n}.html`, and `/tags/{tag}/page/{n}.html`.

Edit `pageSize` on a group to change that list. For example, `"pageSize": 10` on the news group shows 10 per page.

The build reads dates from the HTML. JSON-LD `Article`, `NewsArticle`, and `BlogPosting` supply `headline`, `datePublished`, `articleSection`, `keywords`, and `description` or `image` when those are present. Missing fields fall back to `og:title`, `article:published_time`, `article:section`, and `article:tag`. A page with no date is left out.

Articles sort oldest first by date, then url. Page 1 is the oldest page. The highest page is the newest partial page, and the landing path (for example `/news/index.html`) shows that page. Within a page the newest item is first. Publishing one new article rewrites the newest page and the landing, not every page.

The listing template repeats one item inside `<!--#listing item -->` … `<!--#listing /item -->`. Optional `<!--#listing prev -->` and `<!--#listing next -->` blocks are the pager. `{{title}}` is the group title, `{{heading}}` and `{{url}}` are the article, and `{{prev}}` and `{{next}}` are the links. Values are escaped. The include directives stay, so the header and footer are the shared files. Generated pages are written only under the build output.

Preview and the live host do not serve `_inc/`, `_templates/`, or `.flagstage/`.
