# Gaps

An honest read of what still keeps Flagstage Core from feeling like a mature open-source product. The comparison points are Plausible, Cal.com, Documenso, Infisical, n8n, and Ghost: projects an operator can clone, run, and trust on a weekday afternoon.

The import, chat, preview, and publish loop is real, and `pnpm build` and `pnpm test` pass. The gaps below are what a second look finds. Work deferred past v1 is filed on [rera/flagstage-core](https://github.com/rera/flagstage-core/issues) and is not repeated here.

## Fix before a first release

1. **The image is local only.** `docker image ls` reports 804MB after OpenCode 2.2.7 was added, up from 428MB. `docker image inspect` reports 223,652,790 bytes, up from 101,331,623. The import process, the chat handler, and the CLI are bundled JavaScript, the web process is the Next.js standalone server, OpenCode is a binary under the `flagstage` home, and the container user is uid 10001. Nothing publishes the image. The single-VM compose file is for evaluation only. The Lambda image (`docker build --target lambda`) has not been built in this checkout.

## What mature projects have that this repo does not

2. **CI does not call Bedrock.** The image runs OpenCode 2.2.7 headless, and the task role is the only credential. Intent stays a deterministic rule unless a model client is passed in. The end-to-end test still puts a local `opencode` double on `PATH`. `bedrock-edit.integration.test.ts` calls the real binary and is skipped unless AWS credentials are present. `flagstage doctor` reports fail when the caller has no AWS credentials.

3. **A hostname you add is a checklist, not an alias.** Published sites on the configured domain are `https://{slug}.{domain}`, from S3 through CloudFront, using a key value store. The stack does not add other hostnames as CloudFront aliases. `DOMAINS_DRIVER` stays `none` in that stack. The checklist tells the operator which DNS records to create. Nothing calls a registrar.

## Smaller, still real

The CLI verbs are `admin add`, `account create`, `member add`, and `site export`.

## Spec §13, what is in place

Checked against the mature-OSS checklist. Items above are the ones that are still open. The rest of that checklist is in the tree:

- `docker compose up`, `.env.example`, and `docs/configuration.md` generated from the env schema. A first run has no sites until someone imports one.
- `flagstage.config.json` holds the domain, organization name, first admin email, Bedrock model, region, SES from-address, and brand. `flagstage doctor` checks Bedrock with the caller credentials. There is no setup wizard and no model-key form.
- `docs/index.md` links getting started, the CloudFormation deploy, configuration, roles, the DNS checklist, importing, upgrading, backup, architecture, troubleshooting, and the FAQ. A docs site is explicitly later.
- README: pitch, screenshot, quickstart, architecture, docs links, and contributing. `ROADMAP.md` points at Discussions.
- `/api/health` and `/api/ready` (database and storage).
- RDS backups of 7 days, S3 versioning, `docs/backup-restore.md`, and `flagstage site export`.
- Migrations at boot behind an advisory lock. `docs/upgrading.md`. Changelog section for 0.1.0, unreleased, with no breaking changes yet.
- SES for invites, password reset, and form mail.
- Image: multi-stage, uid 10001, healthcheck, OCI source and license labels.
- CloudFormation in `infra/cloudformation`, deployed with `./deploy.sh`. Helm is later.
- `docs/roles.md` matches the `can()` roles. `LICENSE`, `NOTICE`, `TRADEMARKS.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CONTRIBUTING.md`, issue forms, discussion forms, the pull request template, and `docs/contributing/starter-issues.md`.
- "Powered by Flagstage" is in the app footer. Published HTML is the snapshot, not that layout. README and the docs index carry `copy-review: required before announce`.

## Intentionally out

No phone-home and no update check. No billing, plans, or a review queue. No inbound email, SMS, or Slack. No registrar API. No docs site and no Helm chart in v1. No community channel besides GitHub Discussions. Those are decisions, not unfinished work.

## Closed

- The web container starts chat in one Lambda and imports as one-off tasks. Locally those functions run in the web process. The site page shows pages found, pages done, and skipped pages, and it follows the draft.
- Published sites are S3 to CloudFront. The app does not serve them. Previews are auth-gated at `/preview/<token>`. Local viewing is `pnpm dev:sites`. `none` stays the domains driver in the stack.
- A first run is empty. `adminEmail` in `flagstage.config.json` creates the first admin and prints a one-time sign-in link. There is no demo organization, demo site, or demo password.
- An admin creates an account from the app or with `flagstage account create`. `flagstage member add` invites an account admin. See [Invite account admins](account-admins.md).
- `pnpm e2e` signs in, imports a local fixture, sends a chat edit, opens the preview, publishes, and reads the DNS checklist. The workflow file is `docs/ci/workflows/e2e.yml`.
- The runtime image no longer copies the workspace or runs TypeScript through `tsx`. It includes OpenCode 2.2.7. Displayed size is 804MB.
- Analytics shows 7, 30, and 90 day totals, a bar for each day, and the top pages. Form submissions keep the signed webhook and mail `FORM_NOTIFY_EMAIL` plus the form's own list through SES.
- The README leads with a screenshot of the app. README and announcement copy still carry `copy-review: required before announce`.
- Sign-in is email and password. An admin page lists people and can promote or remove an admin. The Admin link is hidden from everyone else. The one-time `/bootstrap` link sets its cookie in a route handler.
- Accounts, sites, versions, form submissions, and analytics each show an empty state with one next action. Focus is visible on links, buttons, and fields, and the first Tab stop is "Skip to content". `pnpm e2e` runs axe.
- `flagstage member add` grants an account role. `flagstage user reset-password` works in local development, and in production only with `FLAGSTAGE_BREAK_GLASS=1`. `flagstage site export <site> --out file.tgz` packs the published snapshot and `content.json`. `flagstage backup` prints the `pg_dump` and storage commands and does not call AWS.
- Issue templates, the pull request template, `CODEOWNERS` (`@rera`), and Dependabot are in the repo. `CHANGELOG.md` follows Keep a Changelog for 0.1.0, which is unreleased. Vulnerability reports go through GitHub private reporting, as `SECURITY.md` describes. There is no `FUNDING.yml`.
- Operator docs cover getting started, a CloudFormation deploy, roles, the DNS checklist, upgrading, and the FAQ.

## Deferred

Filed on [rera/flagstage-core](https://github.com/rera/flagstage-core/issues):

- [#1 Trace each chat turn and import with one correlation ID](https://github.com/rera/flagstage-core/issues/1)
- [#2 Health metrics and alarms in the CloudFormation stack](https://github.com/rera/flagstage-core/issues/2)
- [#3 Screen-reader accessibility pass](https://github.com/rera/flagstage-core/issues/3)
- [#4 Revisit CI: repo CI and deploying from CI](https://github.com/rera/flagstage-core/issues/4)
- [#5 Bring back SSO, SAML and SCIM](https://github.com/rera/flagstage-core/issues/5) from `feature/sso`
- [#6 Internationalization](https://github.com/rera/flagstage-core/issues/6)
- [#7 README demo GIF of the builder](https://github.com/rera/flagstage-core/issues/7)
