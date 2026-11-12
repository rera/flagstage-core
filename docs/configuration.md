<!-- copy-review: required before announce -->

# Configuration

Flagstage Core reads configuration from the environment. The schema in
`packages/config` validates it at boot and prints every problem at once.
This page is generated from that schema. Do not edit it by hand.
Regenerate it with `pnpm docs:config`.

Secrets have no production default. A placeholder `BETTER_AUTH_SECRET` is
rejected when `NODE_ENV=production`.

Organization name, domain, the first admin, the Bedrock model, the region,
the SES from-address, and the brand live in `flagstage.config.json` at the
repository root. `flagstage.config.schema.json` is the schema. The auth
secret is not in that file. The stack creates it in Secrets Manager.

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
| `AI_MODEL_SMALL` | no | `amazon.nova-micro-v1:0` | Bedrock model id for short replies. The editor uses the model in flagstage.config.json. |
| `AGENT_MODEL` | no | `amazon.nova-micro-v1:0` | Bedrock model id passed to OpenCode for site edits. |
| `AGENT_TIMEOUT_SEC` | no | `600` | Hard timeout for one agent turn, in seconds. |
| `MAIL_FROM` | no | `` | From address for SES. Defaults to sesFrom in flagstage.config.json. |
| `FORM_NOTIFY_EMAIL` | no | `` | Optional addresses that receive a form submission. Separate several with commas. A form's own notify list is included too. |
| `EMAIL_PASSWORD_ENABLED` | no | `1` | Set to 0 to turn off email and password sign-in. |
| `IMPORT_MAX_PAGES` | no | `500` | Default page cap for an import. |
| `IMPORT_MAX_DEPTH` | no | `6` | Default link depth for an import. |
| `IMPORT_MAX_ASSETS` | no | `10000` | Default asset cap for an import. |
| `ANALYTICS_ENABLED` | no | `1` | Default for new sites. A site can turn analytics off. When off, the beacon is not injected. |
| `LOG_LEVEL` | no | `info` | pino level: fatal, error, warn, info, debug, trace, or silent. |
| `METRICS_TOKEN` | no | `` | Bearer token required by /api/metrics. When unset, the endpoint responds 404. |
| `NODE_ENV` | no | `development` | development, test, or production. Production refuses placeholder secrets. |

## Drivers

- `STORAGE_DRIVER=fs` stores bytes on disk. Compose uses this so a local checkout needs no object store.
- `STORAGE_DRIVER=s3` talks to AWS or any S3-compatible endpoint (`S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`).
- `HOSTMAP_DRIVER=fs` writes the live hostname map next to the files. `cloudfront-kvs` updates a CloudFront KeyValueStore.
- `DOMAINS_DRIVER=none` still builds the DNS checklist. `cloudfront-tenants` creates or updates a distribution tenant and its managed certificate, then reads that status into the checklist.
- Chat runs OpenCode in one Lambda. OpenCode uses the amazon-bedrock provider and the task role. There is no model API key.

## Telemetry

There is no telemetry. The app does not check for updates and does not send usage anywhere.
