<!-- copy-review: required before announce -->

# Self-hosting on AWS

The supported shape is one ECS service (web and worker containers, same image), RDS Postgres, a private S3 bucket, and CloudFront in front of the snapshots. OpenTofu in `infra/opentofu` creates it. An operator runs it in their own account. This repository does not apply it.

Rough monthly cost before traffic and model usage is about $83 in us-east-1. The [module README](../../infra/opentofu/README.md) has the line items and a diagram.

## Apply

1. Install OpenTofu 1.8 or newer.
2. Copy `infra/opentofu/examples/minimal` or start from `examples/existing-vpc` when the VPC already exists.
3. Set the app hostname, the preview domain, a database password, and a session secret of at least 32 characters.
4. The example module source is a git URL. After the public repository exists, point it at `github.com/rera/flagstage-core` and a release tag.
5. Run `tofu init` and `tofu apply`.
6. Copy the `dns_records` output into the DNS host. Add the certificate-validation records AWS shows for the app certificate, then wait until the certificate is issued.
7. Open the app URL. The first admin email, when set, gets a one-time link in the web container logs.
8. In Settings, register an OIDC or SAML provider and a SCIM token. Use the redirect URI and SCIM base URL shown on that page. Map identity-provider group ids to roles. See [SSO and SCIM](../sso-scim.md).
9. Create an account, invite its admin, and import a site. See [importing](../importing.md).

`create_route53_records` can create the app alias, the preview wildcard, and the certificate-validation records when both names live in one hosted zone. Site hostnames are still a checklist. Nothing here talks to a registrar.

## Image

The default image name is `ghcr.io/rera/flagstage-core:latest`. This repository does not push that image. Build `docker/Dockerfile` and set `image` to a registry the task can pull.
