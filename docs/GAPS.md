# Gaps

An honest read of what still keeps Flagstage Core from feeling like a mature open-source product. The comparison points are Plausible, Cal.com, Documenso, Infisical, n8n, and Ghost: projects an operator can clone, run, and trust on a weekday afternoon.

The import, chat, preview, and publish loop is real, and `pnpm build` and `pnpm test` pass. The gaps below are what a second look finds.

## Fix before calling the demo done

1. **The image runs, and it is not small.** `docker compose up` starts Postgres, the web app, and the worker. The demo signs in as `demo@example.com` / `demo-demo-demo` and shows the two seeded accounts. The web process is the Next.js standalone server, bound to `0.0.0.0` so the image health check can reach it. The worker still runs `node --import tsx` against TypeScript, and the image copies the whole workspace install so those links resolve. A production image would compile the worker and leave the workspace out. The single-VM compose file is for evaluation only. The image is not published.

2. **Adding a hostname does not call CloudFront.** The tenant adapter and its tests take a fake client. The domain page always uses the `none` driver, which writes the checklist and skips AWS. A deployment with `DOMAINS_DRIVER=cloudfront-tenants` still will not create a tenant. The OpenTofu module creates the distribution, the KeyValueStore, and the two functions. The app does not yet speak to them.

## What mature projects have that this repo does not

3. **No proof the happy path survives a browser.** Plausible, Cal.com, Documenso, and Ghost ship Playwright (or an equivalent) that signs in and finishes the main task. Core has unit tests and two Better Auth integration tests. There is no browser test that imports a fixture, sends a chat message, approves it, and opens the preview.

4. **The analytics screen is a list, not a product.** Plausible's bar is a date range, top pages, and top referrers without cookies. Core hashes visitors the same way, rolls raw events into daily rows after 48 hours, and removes the script on the next publish when analytics is off. The page does not offer 7, 30, or 90 days, and it does not chart anything.

5. **Forms notify by webhook only.** A signed webhook and a CSV download exist. SMTP is a config field and is not used to mail a submission. Ghost and Documenso both send mail as part of the main loop.

6. **First run is two fields.** Setup asks for an organization name and a base domain. There is no logo, no "test the model key" button, and no guided first import. Cal.com and Infisical spend real effort on the first ten minutes. The demo seed creates an admin and two accounts, and no site, so the chat loop still starts with an import.

7. **The editor is a mock unless you bring a binary.** `AI_MOCK=1` appends the request to `index.html`. With the mock off, the subprocess runner executes `opencode` with a scrubbed prompt and a short skill set (clarify, forms, images, contrast). The Vercel AI SDK is not a dependency. Intent uses a deterministic rule, or one OpenAI-compatible chat call when a model is configured. The commercial skill shelf was rewritten down, not copied. Nobody has run this against a real key in CI.

8. **The admin CLI is `doctor` plus stubs.** `create-admin`, `create-account`, `add-member`, `import`, `reset-password`, and `export-site` print that they are not available. Infisical and n8n are operable from the terminal when the UI is the wrong tool.

9. **Screenshots are a placeholder SVG.** The README describes the product and points at `docs/assets/screenshot-app.svg`. Ghost, Plausible, and Documenso lead with pictures of the real UI. Replace the placeholder before any announcement. README and docs that describe the product are marked `copy-review: required before announce`.

## Smaller, still real

10. **Strings live in one JSON file.** `t()` reads `packages/ui/src/messages/en.json`. next-intl is not wired, so there is no locale switch and no extraction pipeline.

11. **SSO settings write provider rows directly.** Sign-in uses Better Auth. The settings page inserts the provider row instead of calling Better Auth's register endpoint. Behavior matches the tests. The path is not the one the library documents.

12. **CI workflows sit in `docs/ci/workflows/`.** They are not under `.github/workflows/` because this branch lives in a private repository where those files would run. Move them when the public repository exists. The OpenTofu examples point at `github.com/rera/flagstage` `core/main` for the same reason. Point them at `github.com/rera/flagstage-core` and a release tag when that repository exists.

13. **No release automation beyond changesets.** There is a changelog stub and changeset files. There is no tag, no GitHub release, no image publish. The image workflow is written to build and not push.

14. **Accessibility and empty states are thin.** Buttons and fields use the shared components. There is no keyboard pass, no screen-reader pass, and several pages are unstyled tables. Cal.com and Documenso treat this as part of the product, not a follow-up.

## Intentionally out

No phone-home and no update check. No billing. No inbound email, SMS, or Slack. No registrar API. No second compute platform for the agent. Those are decisions, not unfinished work.

## Closed

- Import and chat turns are queued on pg-boss. The web process writes the row and returns. The worker crawls and runs the editor. The site page follows import status, thread status, and new messages.
