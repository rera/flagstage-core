<!-- copy-review: required before announce -->

# Flagstage Core

Import the site you already have. Change it in chat. Publish when the preview looks right.

Flagstage Core is a self-hosted app for an organization that runs many accounts and many sites. Live sites are static files. The app is never on the visitor path.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-22-339933)](https://nodejs.org)
[![Discussions](https://img.shields.io/badge/community-discussions-0f766e)](https://github.com/rera/flagstage-core/discussions)

![Example site in Flagstage Core, live and ready for a chat edit](docs/assets/screenshot-app.png)

## Features

- Import into a versioned static snapshot, with a plain-language fidelity report.
- Chat is the only way to request a change. An agent edits files in a sandbox and opens a preview.
- Approve publishes with a compare-and-swap. Roll back the same way.
- Organization, accounts, and two roles: admin and account admin.
- Email and password sign-in. An admin can promote or remove another admin.
- Custom domains as a copyable DNS checklist with live checks against public resolvers.
- Lead forms, with a signed webhook and optional SMTP mail, and cookie-free site analytics.
- Bring your own model API key. Edits run through OpenCode.
- `flagstage admin add`, `flagstage account create`, and `flagstage import`.
- No telemetry and no update check.

## Quickstart

About a minute, with Docker.

1. `docker compose up`
2. Open http://localhost:3000
3. Sign in with the one-time link printed in the web log
4. Import a site, describe a change, and approve the preview when it looks right.

Health check: http://localhost:3000/api/health. A first run has no sites.

To work on the code against the same Postgres:

```bash
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

`pnpm e2e` signs in, imports a fixture, edits in chat, opens the preview, publishes, and reads the DNS checklist.

## Self-hosting

The supported install is one container service on AWS, described in [docs/self-hosting/aws-opentofu.md](docs/self-hosting/aws-opentofu.md) and built by the OpenTofu module in `infra/opentofu`. You create the DNS records the module prints. Core does not talk to a registrar.

A single virtual machine with Compose is [evaluation only](docs/self-hosting/single-vm.md).

Configuration is environment variables, validated at boot. The reference is [docs/configuration.md](docs/configuration.md).

## Architecture

```mermaid
flowchart LR
  staff[Staff] --> alb[Load balancer]
  alb --> web[Web]
  web --> pg[(Postgres)]
  worker[Worker] --> pg
  worker --> files[Snapshot storage]
  web --> files
  visitors[Visitors] --> edge[CloudFront]
  edge --> files
```

The web process is Next.js: the UI, auth, previews, forms, and the analytics collect endpoint. The worker is the same image running pg-boss: import, agent turns, publish, DNS checks, and analytics rollups. Postgres holds the data and the job queue. There is no Redis.

Agent turns run OpenCode as a subprocess in a temp directory. The subprocess environment has the model settings it needs. It does not receive the database URL.

## Compare

|                             | Flagstage Core                 | A traditional CMS    | Webflow or Squarespace  | A static-site generator | An AI app builder             |
| --------------------------- | ------------------------------ | -------------------- | ----------------------- | ----------------------- | ----------------------------- |
| You already have a site     | Import it                      | It is the site       | Rebuild                 | Rebuild                 | Clone into a new codebase     |
| Who edits                   | Anyone in the account, in chat | Whoever has the admin | Whoever has the project | Whoever has the repo    | Whoever can prompt a codebase |
| What visitors hit           | Static files                   | PHP                  | Their hosting           | Static files            | Their hosting                 |
| Approve before it goes live | Yes                            | Depends on plugins   | Their editor            | Your review process     | Varies                        |
| Identity                    | Email and password             | Plugins              | Their accounts          | Your git host           | Their accounts                |
| You run it                  | Yes                            | Yes                  | No                      | Yes                     | Usually no                    |

The cells describe the typical shape of each approach. A given product can differ.

## Roadmap

See [ROADMAP.md](ROADMAP.md). Ideas belong in [Discussions](https://github.com/rera/flagstage-core/discussions) first.

## Community

Questions, ideas, and things you shipped: [GitHub Discussions](https://github.com/rera/flagstage-core/discussions).

Bugs and feature requests: GitHub Issues. Read [CONTRIBUTING.md](CONTRIBUTING.md) before a pull request. Commits need a Developer Certificate of Origin sign-off (`git commit -s`), not a separate license agreement.

## Security

Report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License and trademarks

[Apache-2.0](LICENSE). Copyright 2026 Rera. See [NOTICE](NOTICE) and [TRADEMARKS.md](TRADEMARKS.md).

## Hosted option

Don't want to run it? [Flagstage](https://flagstage.com) hosts it.
