# Development

## Requirements

Node.js 22, pnpm 10, Docker.

## Demo

```bash
cp .env.example .env
docker compose up
```

`AI_MOCK=1` and `SEED_DEMO=1` are set in `docker/compose.yml`.

## App against compose Postgres

```bash
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

In another terminal:

```bash
pnpm --filter @flagstage/worker start
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Unit tests do not call AWS. `pnpm flagstage doctor` checks env, the database, storage, the model key, and SMTP.

## Migrations

SQL lives in `packages/db/drizzle`. The web and worker processes apply it at start behind a Postgres advisory lock. Migrations are forward-only.

## Admin CLI

```bash
pnpm flagstage doctor
pnpm flagstage create-admin you@example.com
pnpm flagstage create-account "Membership"
```

## Copy review

`README.md`, `docs/index.md`, `ROADMAP.md`, and other announcement language are marked `copy-review: required before announce`. Do not treat that mark as optional when publishing the repository.
