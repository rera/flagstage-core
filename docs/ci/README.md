# CI workflows

These workflow files are the ones to move into `.github/workflows/` after this
tree lives in its own public repository.

They are stored here on purpose. In the private Flagstage repository, a file
under `.github/workflows/` would run on this branch. Nothing here deploys, and
nothing here pushes an image.

Move them when the public repository exists:

```bash
mkdir -p .github/workflows
mv docs/ci/workflows/*.yml .github/workflows/
```

`pnpm e2e` runs the Playwright happy path locally. It signs in as the demo
admin, imports a fixture page, sends a chat edit in mock mode, opens the
preview, publishes, and reads the DNS checklist. With no `DATABASE_URL`, it
starts Postgres in Docker on port 54329. The app listens on port 3100.

Enable GitHub Discussions and private vulnerability reporting in the repository
settings at the same time. Those are not files.
