# CI workflows

These workflow files stay out of `.github/workflows/` on `main` of
`rera/flagstage-core`. A file there would run. Nothing here deploys, and
nothing here pushes an image.

`pnpm e2e` runs the Playwright happy path locally. It creates an admin for the
test, imports a fixture page, sends a chat edit through the editor on `PATH`, opens the
preview, publishes, and reads the DNS checklist. With no `DATABASE_URL`, it
starts Postgres in Docker on port 54329. The app listens on port 3100.

The release recipe is [release.md](release.md). `workflows/version.yml` opens a
Changesets version pull request, and `workflows/release.yml` builds a
`linux/amd64` and `linux/arm64` image and pushes it to ECR Public
(`public.ecr.aws/rera/flagstage-core`). Neither file is wired. `@changesets/cli`
is not installed yet. Add it before enabling the recipe on `main`, and add
`"release": "changeset tag"` so the version workflow can tag without publishing
packages to npm.

Enable GitHub Discussions and private vulnerability reporting in the repository
settings at the same time. Those are not files. There is no `FUNDING.yml`.
