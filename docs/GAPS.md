# Gaps

An honest read of what still keeps Flagstage Core from feeling like a mature open-source product. The comparison points are Plausible, Cal.com, Documenso, Infisical, n8n, and Ghost: projects an operator can clone, run, and trust on a weekday afternoon.

The import, chat, preview, and publish loop is real, and `pnpm build` and `pnpm test` pass. The gaps below are what a second look finds.

## Fix before calling the demo done

1. **The image is local only.** `docker image ls` reports 428MB, down from 2.8GB. `docker image inspect` reports 101,331,623 bytes, down from 682,365,327. The worker and the CLI are bundled JavaScript, the web process is the Next.js standalone server, and the container user is uid 10001. Nothing publishes the image. The single-VM compose file is for evaluation only.

## What mature projects have that this repo does not

2. **First run still skips the last mile.** Setup walks through the organization, an OIDC or SAML provider, the first account, and a group-to-role mapping. There is no logo upload and no button that tests the model key.

3. **The editor is a mock unless you bring a binary.** `AI_MOCK=1` appends the request to `index.html`. With the mock off, the subprocess runner executes `opencode` with a scrubbed prompt and a short skill set (clarify, forms, images, contrast). The Vercel AI SDK is not a dependency. Intent uses a deterministic rule, or one OpenAI-compatible chat call when a model is configured. The commercial skill shelf was rewritten down, not copied. Nobody has run this against a real key in CI.

4. **Some operator commands are still missing.** `flagstage admin add`, `flagstage account create`, and `flagstage import <url> --account` work. Resetting a password, exporting a site, and adding a member from the terminal do not.

5. **Screenshots are a placeholder SVG.** The README describes the product and points at `docs/assets/screenshot-app.svg`. Ghost, Plausible, and Documenso lead with pictures of the real UI. Replace the placeholder before any announcement. README and docs that describe the product are marked `copy-review: required before announce`.

## Smaller, still real

6. **Strings live in one JSON file.** `t()` reads `packages/ui/src/messages/en.json`. next-intl is not wired, so there is no locale switch and no extraction pipeline.

7. **SSO settings write provider rows directly.** Sign-in uses Better Auth. The settings page inserts the provider row instead of calling Better Auth's register endpoint. Behavior matches the tests. The path is not the one the library documents.

8. **CI workflows sit in `docs/ci/workflows/`.** They are not under `.github/workflows/` because this branch lives in a private repository where those files would run. Move them when the public repository exists. The OpenTofu examples point at `github.com/rera/flagstage` `core/main` for the same reason. Point them at `github.com/rera/flagstage-core` and a release tag when that repository exists.

9. **No release automation beyond changesets.** There is a changelog stub and changeset files. There is no tag, no GitHub release, no image publish. The image workflow is written to build and not push.

10. **Accessibility and empty states are thin.** Buttons and fields use the shared components. There is no keyboard pass, no screen-reader pass, and several pages are unstyled tables. Cal.com and Documenso treat this as part of the product, not a follow-up.

## Intentionally out

No phone-home and no update check. No billing. No inbound email, SMS, or Slack. No registrar API. No second compute platform for the agent. Those are decisions, not unfinished work.

## Closed

- Import and chat turns are queued on pg-boss. The web process writes the row and returns. The worker crawls and runs the editor. The site page follows import status, thread status, and new messages.
- `DOMAINS_DRIVER=cloudfront-tenants` creates and updates a distribution tenant and its managed certificate, then reads the certificate status into the DNS checklist. `none` stays the local default.
- `SEED_DEMO=1` publishes an example site on the Digital account. Chat, preview, and publish work in mock mode without an import. A later publish is left in place.
- Setup is a four-step wizard: organization, identity provider, first account, then a group-to-role mapping. `flagstage admin add`, `flagstage account create`, and `flagstage import` do the same work from a shell. See [Assign department admins](department-admins.md).
- `pnpm e2e` signs in, imports a local fixture, sends a chat edit, opens the preview, publishes, and reads the DNS checklist. The workflow file is `docs/ci/workflows/e2e.yml`.
- The runtime image no longer copies the workspace or runs TypeScript through `tsx`. Displayed size went from 2.8GB to 428MB.
- Analytics shows 7, 30, and 90 day totals and the top pages. It does not chart. Form submissions keep the signed webhook and, when `SMTP_URL` is set, mail `FORM_NOTIFY_EMAIL` plus the form's own list.
