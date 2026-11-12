# Development

## Requirements

Node.js 22, pnpm 10, Docker.

## Local

```bash
cp .env.example .env
docker compose up
```

The web log prints a one-time sign-in link for `adminEmail` in `flagstage.config.json`. Nothing is seeded. `pnpm dev:sites` serves published files on 127.0.0.1:8088.

## App against compose Postgres

```bash
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

In another terminal:

Chat and imports run in the web process when `LAMBDA_FUNCTION_NAME` and `ECS_CLUSTER` are unset. Do not start a second process for them.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Unit tests do not call AWS. `packages/agent/src/bedrock-edit.integration.test.ts` edits a one-page site with OpenCode and is skipped unless AWS credentials are present. `pnpm flagstage doctor` checks env, the database, storage, and Bedrock.

## Migrations

SQL lives in `packages/db/drizzle`. The web process applies it at start behind a Postgres advisory lock. Chat and import tasks do not migrate. Migrations are forward-only.

## Admin CLI

```bash
pnpm flagstage doctor
pnpm flagstage admin add --email you@example.com
pnpm flagstage account create "Membership"
```

## Copy review

`README.md`, `docs/index.md`, `ROADMAP.md`, and other announcement language are marked `copy-review: required before announce`. Do not treat that mark as optional when publishing the repository.
