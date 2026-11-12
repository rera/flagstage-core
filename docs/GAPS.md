# Gaps

An honest read of what still keeps Flagstage Core from feeling like a mature open-source product. The comparison points are Plausible, Cal.com, Documenso, Infisical, n8n, and Ghost: projects an operator can clone, run, and trust on a weekday afternoon.

The import, chat, preview, and publish loop is real, and `pnpm build` and `pnpm test` pass. The gaps below are what a second look finds.

## Fix before calling the demo done

1. **The image is local only.** `docker image ls` reports 428MB, down from 2.8GB. `docker image inspect` reports 101,331,623 bytes, down from 682,365,327. The worker and the CLI are bundled JavaScript, the web process is the Next.js standalone server, and the container user is uid 10001. Nothing publishes the image. The single-VM compose file is for evaluation only.

## What mature projects have that this repo does not

2. **Edits run through OpenCode.** The worker downloads the snapshot, runs `opencode`, and uploads the diff. Intent uses a deterministic rule unless a model client is configured. CI does not call a model. The end-to-end test puts a local `opencode` double on `PATH`; that script is not in the product.

## Smaller, still real

3. **Strings live in one JSON file.** `t()` reads `packages/ui/src/messages/en.json`. next-intl is not wired, so there is no locale switch and no extraction pipeline. Version times are ISO strings, not `Intl` formatters.

4. **CI workflows sit in `docs/ci/workflows/`.** They are not under `.github/workflows/` because this branch lives in a private repository where those files would run. Move them when the public repository exists.

5. **The release recipe is written and not wired.** [docs/ci/release.md](ci/release.md) uses Changesets for the version pull request and a multi-arch GHCR image on a `v*` tag. Those workflows sit in `docs/ci/workflows/` and do not run. There is no tag, no GitHub release, and no published image. `@changesets/cli` is not installed yet, so `pnpm exec changeset version` in [RELEASING.md](../RELEASING.md) does not run until that package is added. The image has not been built for `linux/arm64`.

6. **No manual screen-reader pass.** Playwright runs axe on the signed-in flow, and the empty pages name one next action. Form fields are labelled, focus is visible, and `eslint-plugin-jsx-a11y` is on. The components are our own, not Radix. Nobody has walked the app with a screen reader.

7. **HTTP logs have no request id.** pino writes JSON and `LOG_LEVEL` selects the level. A request is not stamped onto those lines.

8. **Metrics are totals, not queue health.** `/api/metrics` is Prometheus text behind `METRICS_TOKEN`, and 404 when the token is unset. It counts import runs, publish events, and change requests. It does not report jobs queued or jobs failed.

9. **The README has a still, not a GIF.** `docs/assets/screenshot-app.png` is a still of the app. There is no recording of import, chat, and publish. There is no latest-release badge because nothing is tagged. A build badge waits until the workflows actually run.

Section 12 of the spec still asks for a live import progress view (pages found, assets, warnings). The site page shows importing, failed, or live. The CLI verbs are `admin add`, `account create`, `member add`, and `site export`, not `create-admin` or `export-site`.

## Spec §13, what is in place

Checked against the mature-OSS checklist. Items above are the ones that are still open. The rest of that checklist is in the tree:

- `docker compose up`, `.env.example`, and `docs/configuration.md` generated from the env schema. A first run has no sites until someone imports one.
- Setup wizard, including a logo and a model-key check, and `flagstage doctor`.
- `docs/index.md` links getting started, the CloudFormation deploy, configuration, roles, the DNS checklist, importing, upgrading, backup, architecture, troubleshooting, and the FAQ. A docs site is explicitly later.
- README: screenshot, license and Discussions badges, features, quickstart, comparison, roadmap, community, contributing, security, license, trademarks, and the hosted option. `ROADMAP.md` points at Discussions.
- `/api/health` and `/api/ready` (database, storage, and that the `pgboss` schema exists).
- RDS backups of 7 days, S3 versioning, `docs/backup-restore.md`, and `flagstage site export`.
- Migrations at boot behind an advisory lock. `docs/upgrading.md`. Changelog section for 0.1.0, unreleased, with no breaking changes yet.
- Optional SMTP, console when it is unset.
- Image: multi-stage, uid 10001, healthcheck, OCI source and license labels.
- CloudFormation in `infra/cloudformation`, deployed with `./deploy.sh`. Helm is later.
- `docs/roles.md` matches the `can()` roles. `LICENSE`, `NOTICE`, `TRADEMARKS.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CONTRIBUTING.md`, issue forms, discussion forms, the pull request template, and `docs/contributing/starter-issues.md`.
- "Powered by Flagstage" is in the app footer. Published HTML is the snapshot, not that layout. README and the docs index carry `copy-review: required before announce`.

## Intentionally out

No phone-home and no update check. No billing. No inbound email, SMS, or Slack. No registrar API. No second compute platform for the agent. No docs site and no Helm chart in v1. No community channel besides GitHub Discussions. Those are decisions, not unfinished work.

## Closed

- Import and chat turns are queued on pg-boss. The web process writes the row and returns. The worker crawls and runs the editor. The site page follows import status, thread status, and new messages.
- `DOMAINS_DRIVER=cloudfront-tenants` creates and updates a distribution tenant and its managed certificate, then reads the certificate status into the DNS checklist. `none` stays the local default.
- A first run is empty. `adminEmail` in `flagstage.config.json` creates the first admin and prints a one-time sign-in link. There is no demo organization, demo site, or demo password.
- An admin creates an account from the app or with `flagstage account create`. `flagstage member add` invites an account admin. See [Invite account admins](account-admins.md).
- `pnpm e2e` signs in, imports a local fixture, sends a chat edit, opens the preview, publishes, and reads the DNS checklist. The workflow file is `docs/ci/workflows/e2e.yml`.
- The runtime image no longer copies the workspace or runs TypeScript through `tsx`. Displayed size went from 2.8GB to 428MB.
- Analytics shows 7, 30, and 90 day totals, a bar for each day, and the top pages. Form submissions keep the signed webhook and, when `SMTP_URL` is set, mail `FORM_NOTIFY_EMAIL` plus the form's own list.
- The README leads with a screenshot of the app. README and announcement copy still carry `copy-review: required before announce`.
- Sign-in is email and password. An admin page lists people and can promote or remove an admin. The Admin link is hidden from everyone else. The one-time `/bootstrap` link sets its cookie in a route handler.
- Accounts, sites, versions, form submissions, and analytics each show an empty state with one next action. Focus is visible on links, buttons, and fields, and the first Tab stop is "Skip to content". `pnpm e2e` runs axe.
- `flagstage member add` grants an account role. `flagstage user reset-password` works in local development, and in production only with `FLAGSTAGE_BREAK_GLASS=1`. `flagstage site export <site> --out file.tgz` packs the published snapshot and `content.json`. `flagstage backup` prints the `pg_dump` and storage commands and does not call AWS.
- Issue templates, the pull request template, `CODEOWNERS` (`@rera`), and Dependabot are in the repo. `CHANGELOG.md` follows Keep a Changelog for 0.1.0, which is unreleased. Vulnerability reports go through GitHub private reporting, as `SECURITY.md` describes. There is no `FUNDING.yml`.
- Operator docs cover getting started, a CloudFormation deploy, roles, the DNS checklist, upgrading, and the FAQ.
