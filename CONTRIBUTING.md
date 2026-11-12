# Contributing to Flagstage Core

Thanks for looking. Flagstage Core is the self-hosted edition: an organization runs many accounts, each account runs sites, and people change those sites in chat.

## Development setup

Requirements: Node.js 22, pnpm 10, and Docker (for Postgres and the full demo).

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. The first admin comes from `BOOTSTRAP_ADMIN_EMAIL`. The web log prints a one-time sign-in link. A first run has no accounts and no sites.

`docker compose up` from a clean checkout starts Postgres, the web app, and the worker. Edits need OpenCode on the worker `PATH` and a model.

## Repo tour

| Path                 | What it is                                              |
| -------------------- | ------------------------------------------------------- |
| `apps/web`           | Next.js UI, API, auth, preview host, dev live host      |
| `apps/worker`        | pg-boss consumers                                       |
| `apps/cli`           | `flagstage` admin CLI                                   |
| `packages/config`    | Environment schema. Docs are generated from it.         |
| `packages/db`        | Drizzle schema and migrations                       |
| `packages/auth`      | Better Auth, SSO, SCIM, group mapping                   |
| `packages/core`      | Accounts, memberships, `can()`                          |
| `packages/storage`   | `BlobStore` (`fs` and `s3`)                             |
| `packages/importer`  | WordPress-first crawl                                   |
| `packages/agent`     | OpenCode subprocess runner and skills                   |
| `packages/ai`        | Intent, trust judge, and reply calls                    |
| `packages/publish`   | Preview, promote, rollback                              |
| `packages/domains`   | DNS checklist and CloudFront tenants                    |
| `packages/forms`     | Lead forms                                              |
| `packages/analytics` | Beacon, collect, rollups                                |
| `packages/ui`        | Shared primitives and the English message catalog       |
| `infra/opentofu`     | AWS module. Never applied from CI in this repo's build. |
| `docs/`              | Self-hosting and operator docs                          |

## Conventions

- TypeScript strict. Route handlers and server actions, not a second RPC framework.
- One place for each task. Delete unused code. Do not add feature flags.
- Authorization goes through `can()` in `packages/core`.
- The product word is Account. Do not introduce a Customer entity.
- Identity is standards-only: OIDC, SAML 2.0, and SCIM 2.0. Do not add provider-specific clients in `src/`.
- Chat is the only way to request a change. Do not add inbound email, SMS, or Slack.
- UI strings live in `packages/ui/src/messages/en.json`.
- Customer websites keep their own voice. Do not apply Flagstage's marketing voice to imported sites.

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Unit tests do not call AWS. Adapters take a mocked client. Integration tests that need Postgres use PGlite or the compose database when `DATABASE_URL` is set.

## Developer Certificate of Origin

This project uses a Developer Certificate of Origin sign-off instead of a contributor license agreement. Apache-2.0 inbound contributions stay under Apache-2.0.

Certify your commit:

```bash
git commit -s -m "Describe the change"
```

That adds:

```text
Signed-off-by: Your Name <you@example.com>
```

By signing off, you certify the statement in [Developer Certificate of Origin 1.1](https://developercertificate.org/).

## Changesets

User-visible changes need a changeset so the fixed version group stays in lockstep:

```bash
pnpm exec changeset
```

## Pull requests

Use the pull request template. Fill in the DCO checkbox. Keep the change focused.

Questions go to [SUPPORT.md](SUPPORT.md). How the project is maintained is [GOVERNANCE.md](GOVERNANCE.md).

## Good first issues

See `docs/contributing/starter-issues.md`.
