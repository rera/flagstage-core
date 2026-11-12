# Release recipe

This is not wired. Do not copy these files into `.github/workflows/` while this tree lives on the private `core/main` branch. A workflow there would run. The public repository, `rera/flagstage-core`, is where this recipe belongs, and its default branch is `main`. Changesets are already configured with `"baseBranch": "main"`.

[release-please](https://github.com/googleapis/release-please) is a fine alternative. This repo already collects changesets, so the recipe uses those and does not add a second versioning tool.

## 1. Version pull request

On every push to `main`, run Changesets. When changeset files are present, the action opens or updates a pull request titled "Version Packages". That pull request:

- consumes the `.changeset/*.md` files
- bumps the fixed `@flagstage/*` group together
- prepends the notes to `CHANGELOG.md` under the new version

Merging it, with the action's publish script, creates the git tag `vX.Y.Z`. Do not publish the workspace packages to npm from that script. The install path is the container image and `pnpm install` from source. A publish script that exits 0 after the tag is enough:

```json
{
  "scripts": {
    "release": "changeset tag"
  }
}
```

`changeset tag` creates the tag from the versions already written into `package.json`. It does not push the tag by itself. The action pushes the tag when `GITHUB_TOKEN` has `contents: write`.

## 2. Multi-arch image

A tag `v*` builds `linux/amd64` and `linux/arm64` and pushes to GHCR. It does not deploy. The sample workflow is [workflows/release.yml](workflows/release.yml).

```text
ghcr.io/rera/flagstage-core:0.1.0
ghcr.io/rera/flagstage-core:0.1
ghcr.io/rera/flagstage-core:latest
```

The image stays private until the package visibility is changed in the GitHub package settings. Operators pull it only after that.

## 3. What stays manual

The first public release still needs, in the GitHub settings, and not in a workflow:

- Discussions enabled, so `.github/ISSUE_TEMPLATE/config.yml` has somewhere to send questions
- Private vulnerability reporting enabled, so `SECURITY.md` matches the repository
- The GHCR package set to public when the repository is public

No workflow in this recipe deploys the CloudFormation stack or restarts a running install.
