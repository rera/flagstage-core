# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) with one fixed version for every package. Add a changeset with every user-visible change:

```bash
pnpm exec changeset
```

Releases are cut from `main` of the public repository. See `RELEASING.md`.
