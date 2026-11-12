<!-- copy-review: required before announce -->

# Getting started

Flagstage Core imports a site, takes change requests in chat, and publishes a static snapshot. This page is the local path. A production install is [Deploy on AWS](self-hosting/aws-opentofu.md).

You need Docker, and nothing else, for the evaluation stack. Node.js 22 and pnpm 10 are only for running from a checkout.

## Run the evaluation stack

From a checkout:

```bash
cp .env.example .env
docker compose up
```

Compose starts Postgres, the web app, and the worker. `AI_MOCK=1` edits a page without a model key. `SEED_DEMO=1` signs you in as `demo@example.com` / `demo-demo-demo` and publishes an example site on the Digital account.

Open http://localhost:3000 and sign in. The example site is already live, so chat, preview, and publish work before you import anything.

`docker compose` is for evaluation. It has no failover, and it serves the live site from the app process. Use the OpenTofu module for a real deployment.

## Import a site from the shell

The same demo database accepts the CLI. In another terminal, with `DATABASE_URL` pointing at the compose database:

```bash
pnpm flagstage account create "Parks"
pnpm flagstage import https://example.com --account parks --name "Parks site"
```

Then open the site in the app, choose Go live, and ask for a change in chat. Approve the preview to publish.

`flagstage admin add --email you@example.com` creates an organization admin and prints a password once. `flagstage member add` grants an account role. See [Assign department admins](department-admins.md).

## What to do next

| You want to…               | Read                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Put it on AWS              | [Deploy on AWS](self-hosting/aws-opentofu.md)                                            |
| Sign people in             | [OIDC](idp/oidc.md), [SAML](idp/saml.md), or the [example values](idp/example-values.md) |
| Point a hostname at a site | [DNS checklist](domains.md)                                                              |
| Upgrade later              | [Upgrading](upgrading.md)                                                                |
