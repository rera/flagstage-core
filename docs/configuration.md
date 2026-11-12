<!-- copy-review: required before announce -->

# Configuration

Flagstage Core reads configuration from the environment. The schema in
`packages/config` validates it at boot and prints every problem at once.
This page is generated from that schema. Do not edit it by hand.
Regenerate it with `pnpm docs:config`.

Secrets have no production default. A placeholder `BETTER_AUTH_SECRET` is
rejected when `NODE_ENV=production`.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `` | Postgres connection string. Required at boot. |
| `BETTER_AUTH_SECRET` | yes | `` | Session signing secret. At least 32 characters. Required. Never commit a production value. |
| `APP_URL` | yes | `` | Public origin of the app, including scheme and no trailing slash. |
| `STORAGE_DRIVER` | no | `fs` | Where snapshots and media are stored. fs for local disk, s3 for any S3-compatible store. |
| `S3_BUCKET` | no | `` | Bucket name. Required when STORAGE_DRIVER=s3. |
| `S3_REGION` | no | `` | Region for the S3 client. Required when STORAGE_DRIVER=s3. |
| `S3_ENDPOINT` | no | `` | Optional S3-compatible endpoint. Leave unset for AWS. |
| `S3_FORCE_PATH_STYLE` | no | `0` | Set to 1 for S3-compatible stores that require path-style addressing. |
| `FS_STORAGE_DIR` | no | `.data/storage` | Directory used when STORAGE_DRIVER=fs. |
| `HOSTMAP_DRIVER` | no | `fs` | How the live hostname map is stored. fs writes a JSON file. cloudfront-kvs writes a CloudFront KeyValueStore. |
| `CLOUDFRONT_KVS_ARN` | no | `` | KeyValueStore ARN. Required when HOSTMAP_DRIVER=cloudfront-kvs. |
| `CLOUDFRONT_DISTRIBUTION_ID` | no | `` | Multi-tenant distribution id. Required when DOMAINS_DRIVER=cloudfront-tenants. |
| `CLOUDFRONT_CONNECTION_GROUP_ENDPOINT` | no | `` | Connection group endpoint operators CNAME to. Shown on the DNS checklist. Required when domains use CloudFront. |
| `CLOUDFRONT_CONNECTION_GROUP_ID` | no | `` | Connection group id for new distribution tenants. Required when DOMAINS_DRIVER=cloudfront-tenants. |
| `DOMAINS_DRIVER` | no | `none` | none records DNS targets only. cloudfront-tenants also creates a distribution tenant per site. |
| `AI_PROVIDER` | no | `anthropic` | Provider for the small intent, judge, and reply models, and the default agent provider. One of anthropic, openai, bedrock, openrouter, openai-compatible, google, azure. |
| `AI_API_KEY` | no | `` | Bring-your-own model API key. Bedrock may use the task role instead of a key. |
| `AI_BASE_URL` | no | `` | Base URL for openai-compatible, openrouter, or a custom gateway. |
| `AI_MODEL_SMALL` | no | `claude-haiku-4-5` | Model id for intent, trust judge, and short replies. |
| `AGENT_MODEL` | no | `claude-sonnet-4-5` | Model id passed to OpenCode for site edits. |
| `AGENT_TIMEOUT_SEC` | no | `600` | Hard timeout for one agent turn, in seconds. |
| `SMTP_URL` | no | `` | Optional SMTP URL for invites and notices. When unset, mail is printed to the log. |
| `MAIL_FROM` | no | `` | From address used when SMTP_URL is set. |
| `FORM_NOTIFY_EMAIL` | no | `` | Optional addresses that receive a form submission when SMTP_URL is set. Separate several with commas. A form's own notify list is included too. |
| `BOOTSTRAP_ADMIN_EMAIL` | no | `` | When the database has no users, a one-time sign-in link for this address is printed to the logs (and sent if SMTP is set). |
| `EMAIL_PASSWORD_ENABLED` | no | `1` | Set to 0 to turn off email and password sign-in. SSO remains available. |
| `IMPORT_MAX_PAGES` | no | `500` | Default page cap for an import. |
| `IMPORT_MAX_DEPTH` | no | `6` | Default link depth for an import. |
| `IMPORT_MAX_ASSETS` | no | `10000` | Default asset cap for an import. |
| `ANALYTICS_ENABLED` | no | `1` | Default for new sites. A site can turn analytics off. When off, the beacon is not injected. |
| `LOG_LEVEL` | no | `info` | pino level: fatal, error, warn, info, debug, trace, or silent. |
| `METRICS_TOKEN` | no | `` | Bearer token required by /api/metrics. When unset, the endpoint responds 404. |
| `NODE_ENV` | no | `development` | development, test, or production. Production refuses placeholder secrets. |

## Drivers

- `STORAGE_DRIVER=fs` stores bytes on disk. Compose uses this so a local demo needs no object store.
- `STORAGE_DRIVER=s3` talks to AWS or any S3-compatible endpoint (`S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`).
- `HOSTMAP_DRIVER=fs` writes the live hostname map next to the files. `cloudfront-kvs` updates a CloudFront KeyValueStore.
- `DOMAINS_DRIVER=none` still builds the DNS checklist. `cloudfront-tenants` creates or updates a distribution tenant and its managed certificate, then reads that status into the checklist.
- The worker runs OpenCode for site edits. Set `AI_API_KEY` unless `AI_PROVIDER` is `bedrock`.

## Telemetry

There is no telemetry. The app does not check for updates and does not send usage anywhere.
