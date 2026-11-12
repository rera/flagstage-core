# Releasing

Flagstage Core uses one version for the whole repository (Changesets fixed group). Images are not published by the build in this tree. Push to a registry is a manual step until CI is approved for it.

The unwired automation is [docs/ci/release.md](docs/ci/release.md): a Changesets version pull request, then a `linux/amd64` and `linux/arm64` image on GHCR. `@changesets/cli` is not installed yet. Add it before step 2 below.

## Cut a release

1. Land changesets on `main`.
2. Run `pnpm exec changeset version`. That bumps `package.json` files and updates `CHANGELOG.md`.
3. Open a pull request titled `Version packages`.
4. After it merges, tag the commit:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. Build the image locally and push it by hand:

   ```bash
   docker build -f docker/Dockerfile -t ghcr.io/rera/flagstage-core:X.Y.Z -t ghcr.io/rera/flagstage-core:latest .
   docker push ghcr.io/rera/flagstage-core:X.Y.Z
   docker push ghcr.io/rera/flagstage-core:latest
   ```

6. Publish GitHub release notes from the changelog section. Call out a `Breaking` heading when operators must do something besides pull and restart.

## Breaking changes

List them in `docs/upgrading.md` under the version, and in the changelog under `### Breaking`.

Migrations are forward-only and run at container start behind an advisory lock.
