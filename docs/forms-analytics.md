# Forms and analytics

Lead forms post to `/f/{siteId}/{formKey}`. The browser is allowed only when its origin host is one of the site's hostnames or `{slug}.{base domain}`. A non-empty `website` field is dropped. Each address gets a small token bucket in Postgres. Stored submissions can be downloaded as CSV from the site, and a webhook receives `x-flagstage-signature: sha256=...` when a secret is set.

Analytics is one script tag added when a change is published, and removed on the next publish when analytics is off for the site. The script sends the path and referrer to `/a/collect`. Visitors are a daily hash of the address and user agent. Raw events are deleted after 48 hours, once an hourly job has added them to the daily totals. There are no cookies.
