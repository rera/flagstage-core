<!-- copy-review: required before announce -->

# FAQ

## Does Flagstage Core phone home?

No. There is no telemetry and no update check.

## Where do visitors' requests go?

To CloudFront, then to the current snapshot in object storage. The app serves auth-gated previews at `/preview/<token>`. It does not serve a published site.

## How do people sign in?

With an email and a password. An admin invites someone to an account, or `flagstage admin add` creates another admin. The first admin comes from `flagstage.config.json` or the CLI.

## Do we have to bring a model key?

No. OpenCode calls Amazon Bedrock with the task role. `flagstage doctor` checks that call. There is no model API key and no mock editor.

## What is the difference between hosted Flagstage and this repository?

Hosted Flagstage is the operated service at https://flagstage.com. This repository is the software you run yourself. It does not include billing.

## Can we run Compose in production?

Compose is an evaluation install. The supported production layout is the CloudFormation stack. See [Deploy on AWS](self-hosting/aws.md).

## Where does data live?

Accounts, sites, and form submissions are in Postgres. Snapshot files are in `FS_STORAGE_DIR` or the S3 bucket. Backups are `pg_dump` plus a copy of that store. See [backup and restore](backup-restore.md).

## Does analytics use cookies?

No. A visitor is an HMAC of the day, the address, and the user agent. The analytics page says that visitors are counted per page per day.

## How do we reset a password?

The sign-in page can email a new password through SES. `flagstage user reset-password --email you@example.com` works in local development. In production that command runs only with `FLAGSTAGE_BREAK_GLASS=1`.

## Is the container image published?

Not yet. The name `public.ecr.aws/rera/flagstage-core` is reserved in the examples. Build `docker/Dockerfile` and push it to a registry you control. The release steps are written in [docs/ci/release.md](ci/release.md) and are not wired.
