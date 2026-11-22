# Importing

Paste a URL and start an import. Core checks that the site answers, crawls the public pages, and, when the site exposes a sitemap or a content listing, includes those URLs in the same job.

Defaults: 500 pages, depth 6, 10,000 assets. Caps are environment settings.

The fidelity report lists missing assets, CSS backgrounds, pages that depend on a plugin (forms, search, calendars, logins, comments), and shared blocks that were left in the page because they were not an exact match. Known form plugins are mapped to lead forms when the markup is recognizable. Blocks that match on most pages are stored once under `_inc/` and referenced from the pages. Pages that share a structure become a template under `_templates/`. A site skill is written to `.flagstage/skills/`, and a drift manifest records which pages use each include. When the import finds articles, it also writes `.flagstage/listings.json`. The build turns dated articles into listing pages from that file. Preview and the live site omit those files.

The web process records the site and starts a one-off import task. Locally, with no cluster set, the same import runs in the web process. The site page shows pages found, pages done, and skipped pages while the crawl runs. The import stores the source. Preview and Go live build the public files from it, stitching includes. The first import becomes live only after someone chooses Go live. In development, `pnpm dev:sites` serves the published files. Add `{slug}.localhost` to your hosts file and open it on that server's port.

The crawl is the `public-site` source. [Write your own importer](importers.md) to register another one.
