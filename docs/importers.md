# Write your own importer

An importer is a named source. It returns an `ImportResult`: pages, assets, redirects, forms, a fidelity report, and stats. `runImport` looks the name up in the registry, stores the result, and writes progress onto the import row.

The built-in source is the public-site crawler. Its name is `public-site`. Leave `source` off a run and that crawler is the one that runs. The import screen stays a single URL field.

A fork registers another source the same way. A Contentful importer, for example, lives in the fork. It registers a name and returns an `ImportResult`. This repository ships the crawler only.

## Register

```ts
import { registerImporter, type Importer, type ImportResult } from "@flagstage/importer";

export const acme: Importer = {
  name: "acme",
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
      report: { forms: [], plugins: [], missingAssets: [], cssBackgrounds: [] },
      stats: { pages: 1, assets: 0, pagesFound: 1, pagesDone: 1, skipped: [] }
    };
    await options.onProgress?.({ pagesFound: 1, pagesDone: 1, skipped: [] });
    return result;
  }
};

registerImporter(acme);
```

Call `registerImporter` in the process that runs the import, and import that module before `runImport`. With no cluster set, the web process runs the import. With `ECS_CLUSTER` and `IMPORT_TASK_DEFINITION` set, the import task is `apps/worker`. Registering a name that is already present replaces that source.

`runImport` takes an optional `source`. These three call sites start a run today:

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

`listImporters()` returns the registered names. `getImporter("acme")` returns the source `runImport` will call.

## Result

`pages` and `assets` are the snapshot files. `path` is the object key under the snapshot prefix, such as `index.html`, `about/index.html`, or `assets/logo.png`. `body` is the bytes. `contentType` is stored with the object. Pages are written first, then assets. A repeated path keeps the later write.

`redirects` are stored as 301 rows: `fromPath`, `toPath`, and `source`. `forms` are stored as lead forms: `formKey`, `name`, and `page`. A `formKey` that already exists for the site is left as it is.

`report` is the fidelity report.

| Field            | What it holds                                      |
| ---------------- | -------------------------------------------------- |
| `forms`          | `{ page, kind, detail }` for a form that was found |
| `plugins`        | `{ page, kind, detail }` for something left behind |
| `missingAssets`  | Paths that did not answer                          |
| `cssBackgrounds` | Missing files that were referenced from CSS        |

`stats.pages` and `stats.assets` are the totals stored on the import row when the run finishes. Also set `pagesFound`, `pagesDone`, and `skipped` (`{ path, reason }`). The site page reads those three fields from the row while the import runs and after it finishes.

## Options and progress

`options` carries `sourceUrl`, `appOrigin`, `siteId`, and `caps` (`maxPages`, `maxDepth`, `maxAssets`). Those caps are the operator limits.

`fetchPage` reads one URL and returns `{ status, body, contentType }`, or null. `runImport` sets it. The default follows redirects and calls `fetch`. The public-site crawler requires it.

`onProgress` receives `{ pagesFound, pagesDone, skipped }`. `runImport` writes that object onto the import row and notifies the site page. Call it as the source makes progress. The final `stats` object replaces it when the run completes, so copy the same fields onto `stats`.

A thrown error fails the run. The message is stored on the import row, and the site status becomes `failed`. An unknown `source` fails the same way.

## The public-site crawler

`packages/importer/src/crawl.ts` is the first importer. `publicSiteImporter.name` is `public-site`. `packages/importer/src/registry.ts` registers it when `@flagstage/importer` loads. The type of a source is `Importer` in `packages/importer/src/interface.ts`. The result type is `ImportResult` in `packages/importer/src/types.ts`.

`crawlSite` is that source's `run`. It fetches the origin. It records redirects for `/feed`, `/feed/`, and `/index.php`. When the origin answers `/wp-json`, it also reads `/wp-sitemap.xml` or `/sitemap_index.xml` and the page and post listings, and records `/?p=<id>` for each listed post or page. It then follows same-origin links until a cap stops it. HTML is rewritten into `pages`. Other saved files are `assets`. A recognized form is pointed at `{appOrigin}/f/{siteId}/{formKey}` and added to `forms`. Search, comments, login, and calendar markup are fidelity notes. Missing files are listed on the report.

After each page it calls `onProgress` with pages found, pages done, and any skipped path. An origin that does not answer throws `The site did not answer.`

`stats.pages` on this crawler counts pages visited, including a page that was skipped. `stats.assets` counts files saved as assets. `pages.length` is the HTML that was kept.
