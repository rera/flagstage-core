<!-- copy-review: required before announce -->

# Getting started

Flagstage Core imports a site, takes change requests in chat, and publishes a static snapshot. This page is the local path. A production install is [Deploy on AWS](self-hosting/aws.md).

You need Docker, and nothing else, for the evaluation stack. Node.js 22 and pnpm 10 are only for running from a checkout.

## Run the evaluation stack

From a checkout:

```bash
cp .env.example .env
docker compose up
```

Compose starts Postgres, the web app, and the worker. A first run is empty. `adminEmail` in `flagstage.config.json` creates the first admin, and the web log prints a one-time sign-in link. There is no demo site and no demo password.

Open http://localhost:3000 and sign in with the one-time link from the web log. Import a site before chat, preview, and publish have anything to work on.

`docker compose` is for evaluation. It has no failover. Use `./deploy.sh` for a real deployment. Published sites are not served by the app.

## Import a site from the shell

The same database accepts the CLI. In another terminal, with `DATABASE_URL` pointing at the compose database:

```bash
pnpm flagstage account create "Parks"
pnpm flagstage import https://example.com --account parks --name "Parks site"
```

Then open the site in the app, choose Go live, and ask for a change in chat. Approve the preview to publish.

`flagstage admin add --email you@example.com` creates an admin and prints a password once. `flagstage member add` grants account admin on an account. See [Invite account admins](account-admins.md).

## What to do next

| You want to…               | Read                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Put it on AWS              | [Deploy on AWS](self-hosting/aws.md)                                            |
| Sign people in             | Email and password. The first admin is `adminEmail` in `flagstage.config.json`, or `flagstage admin add`. |
| Point a hostname at a site | [DNS checklist](domains.md)                                                              |
| Upgrade later              | [Upgrading](upgrading.md)                                                                |
