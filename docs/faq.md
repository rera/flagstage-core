<!-- copy-review: required before announce -->

# FAQ

## Does Flagstage Core phone home?

No. There is no telemetry and no update check.

## Where do visitors' requests go?

To CloudFront, then to the current snapshot in object storage. The app serves previews and the local demo, not production traffic.

## Can we use our identity provider?

Yes, if it speaks OIDC or SAML 2.0. SCIM 2.0 provisions users and groups. Map a group id to a role. Names are labels, not rules. The steps are [OIDC](idp/oidc.md), [SAML](idp/saml.md), and an [example values](idp/example-values.md) table. There is no vendor-specific client in the code.

## Do we have to bring a model key?

For real edits, yes. `AI_MOCK=1` runs the local demo without one.

## What is the difference between hosted Flagstage and this repository?

Hosted Flagstage is the operated service at https://flagstage.com. This repository is the software you run yourself. It does not include billing.

## Can we run Compose in production?

Compose is the local demo and an evaluation install. The supported production layout is the OpenTofu module. See [Deploy on AWS](self-hosting/aws-opentofu.md).

## Where does data live?

Accounts, sites, and form submissions are in Postgres. Snapshot files are in `FS_STORAGE_DIR` or the S3 bucket. Backups are `pg_dump` plus a copy of that store. See [backup and restore](backup-restore.md).

## Does analytics use cookies?

No. A visitor is an HMAC of the day, the address, and the user agent. The analytics page says that visitors are counted per page per day.

## How do we reset a password?

`flagstage user reset-password --email you@example.com` works in local development. In production it runs only for one command with `FLAGSTAGE_BREAK_GLASS=1`. Prefer the identity provider for staff passwords.

## Is the container image published?

Not yet. The name `ghcr.io/rera/flagstage-core` is reserved in the examples. Build `docker/Dockerfile` and push it to a registry you control. The release steps are written in [docs/ci/release.md](ci/release.md) and are not wired.
