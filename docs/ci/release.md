# Release recipe

This is not wired. Do not copy these files into `.github/workflows/`. A workflow there would run. The public repository, `rera/flagstage-core`, is where this recipe belongs.

One version produces two artifacts:

- A multi-arch image on Amazon ECR Public: `public.ecr.aws/flagstage/flagstage-core:<version>`
- The CloudFormation template for that version, attached to the GitHub release. `ImageUri` in that copy defaults to the image above.

The release notes include a Launch stack link. CloudFormation accepts an S3 URL:

```text
https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=flagstage&templateURL=https://s3.amazonaws.com/<bucket>/flagstage-core/<version>/template.yaml
```

`./deploy.sh` deploys the template in this repository, which pins the same public image. `./deploy.sh --build` is the fork path: it builds and pushes to the caller's own ECR and passes that URI as `ImageUri`. Migrations run when the container starts, behind a Postgres advisory lock. Upgrading is running `./deploy.sh` again with the new version. See [upgrading](../upgrading.md).

## 1. Version pull request

On every push to `main`, run Changesets. When changeset files are present, the action opens or updates a pull request titled "Version Packages". That pull request consumes the `.changeset/*.md` files, bumps the fixed `@flagstage/*` group together, and prepends the notes to `CHANGELOG.md`.

Merging it creates the git tag `vX.Y.Z`. Do not publish the workspace packages to npm. The install path is the container image.

```json
{
  "scripts": {
    "release": "changeset tag"
  }
}
```

## 2. Image and template

A tag `v*` builds `linux/amd64` and `linux/arm64`, pushes them to ECR Public, uploads `infra/cloudformation/template.yaml` to the public S3 prefix for that version, and creates the GitHub release with the template attached and the Launch stack link in the notes. The sample is [workflows/release.yml](workflows/release.yml). It does not deploy a stack.

## 3. What stays manual

The first public release still needs, outside a workflow:

- An ECR Public repository named `flagstage/flagstage-core`
- A public S3 bucket whose URL is the `templateURL` in the release notes
- Discussions enabled, so `.github/ISSUE_TEMPLATE/config.yml` has somewhere to send questions
- Private vulnerability reporting enabled, so `SECURITY.md` matches the repository

No workflow in this recipe deploys the CloudFormation stack or restarts a running install.
