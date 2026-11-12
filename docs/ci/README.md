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

Enable GitHub Discussions and private vulnerability reporting in the repository
settings at the same time. Those are not files.
