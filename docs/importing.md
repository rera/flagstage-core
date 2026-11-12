# Importing

Paste a URL and start an import. Core checks that the site answers, then seeds URLs from a WordPress sitemap and the REST API when those exist, and crawls the rest.

Defaults: 500 pages, depth 6, 10,000 assets. Caps are environment settings.

The fidelity report lists missing assets, CSS backgrounds, and pages that depend on a plugin (forms, search, calendars, logins, comments). Known form plugins are mapped to lead forms when the markup is recognizable.

The first import becomes live only after someone approves the preview. In development the live site is served at `{slug}.localhost` on the app port.
