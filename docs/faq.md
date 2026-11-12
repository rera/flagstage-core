<!-- copy-review: required before announce -->

# FAQ

## Does Flagstage Core phone home?

No. There is no telemetry and no update check.

## Where do visitors' requests go?

To CloudFront, then to the current snapshot in object storage. The app serves previews and the local demo, not production traffic.

## How do people sign in?

With an email and a password. An admin invites someone to an account, or `flagstage admin add` creates another admin. The first admin comes from `flagstage.config.json` or the CLI.

## Do we have to bring a model key?

For real edits, install OpenCode and set a model. There is no mock editor.

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
