# Release recipe

This is not wired. Do not copy these files into `.github/workflows/` on `main`. A workflow there would run. This recipe belongs in `rera/flagstage-core`.

One version produces three artifacts:

- A multi-arch web image on Amazon ECR Public: `public.ecr.aws/rera/flagstage-core:<version>`
- A multi-arch chat image, `docker build --target lambda`, tagged `public.ecr.aws/rera/flagstage-core:<version>-lambda`
- The CloudFormation template for that version, attached to the GitHub release. `ImageUri` and `LambdaImageUri` in that copy default to those images.

The release notes include a Launch stack link for the template from `main` of `rera/flagstage-core`. CloudFormation accepts an S3 URL:

```text
https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=flagstage-core&templateURL=https://s3.amazonaws.com/<bucket>/rera/flagstage-core/<version>/template.yaml
```

`./deploy.sh` deploys the template in this repository, which pins the same public images. `./deploy.sh --build` is the fork path: it builds the web image and the Lambda image, pushes both to the caller's own ECR, and passes those URIs as `ImageUri` and `LambdaImageUri`. Migrations run when the web container starts, behind a Postgres advisory lock. Upgrading is running `./deploy.sh` again with the new version. See [upgrading](../upgrading.md).

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

- An ECR Public repository named `rera/flagstage-core`
- A public S3 bucket whose URL is the `templateURL` in the release notes
- Discussions enabled, so `.github/ISSUE_TEMPLATE/config.yml` has somewhere to send questions
- Private vulnerability reporting enabled, so `SECURITY.md` matches the repository

No workflow in this recipe deploys the CloudFormation stack or restarts a running install.
