# Importing

Paste a URL and start an import. Core checks that the site answers, crawls the public pages, and, when the site exposes a sitemap or a content listing, includes those URLs in the same job.

Defaults: 500 pages, depth 6, 10,000 assets. Caps are environment settings.

The fidelity report lists missing assets, CSS backgrounds, and pages that depend on a plugin (forms, search, calendars, logins, comments). Known form plugins are mapped to lead forms when the markup is recognizable.

The web process records the site and starts a one-off import task. Locally, with no cluster set, the same import runs in the web process. The site page shows pages found, pages done, and skipped pages while the crawl runs. The first import becomes live only after someone chooses Go live. In development, `pnpm dev:sites` serves the published files. Add `{slug}.localhost` to your hosts file and open it on that server's port.
