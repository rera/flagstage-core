<!-- copy-review: required before announce -->

# Deploy on AWS with OpenTofu

The supported production shape is one ECS service (web and worker containers, same image), RDS Postgres, a private S3 bucket, and CloudFront in front of the snapshots. OpenTofu in `infra/opentofu` creates that. You run it in your own account. This repository does not apply it, and it does not publish the container image.

Rough monthly cost before traffic and model usage is about $83 in us-east-1. The [module README](../../infra/opentofu/README.md) has the line items and a diagram. There is no NAT gateway.

## Before you start

- An AWS account, and credentials that can create a VPC, ECS, RDS, S3, CloudFront, ACM, IAM, and CloudWatch logs.
- OpenTofu 1.8 or newer.
- A hostname for the app, such as `sites.example.com`, and a domain for previews, such as `preview.example.com`.
- A database password of letters and digits. It is embedded in a connection URL.
- A session secret of at least 32 characters. Do not use the placeholder `replace-me-with-32-chars-minimum-secret`. Production refuses that value and a few other well-known placeholders.
- An image the task can pull. `ghcr.io/rera/flagstage-core:latest` is the name in the example, and this repository does not push it. Build `docker/Dockerfile` and push it to a registry you control, then set `image` to that name.

CloudFront certificates and the example provider use `us-east-1`. The module's `aws_region` defaults there. CloudFront itself is global.

## 1. Pick an example

`infra/opentofu/examples/minimal` creates a VPC with two public and two private subnets and no NAT.

`infra/opentofu/examples/existing-vpc` uses a VPC you already have. It needs two public subnets, two private subnets, and the route tables that should get the S3 gateway endpoint.

Copy the example to a directory you keep, outside the module, if you do not want to edit the checkout. The steps below use the minimal example in place.

## 2. Set the inputs

Edit the `module "flagstage"` block. The source in the example is:

```hcl
source = "git::https://github.com/rera/flagstage.git//infra/opentofu?ref=core/main"
```

When the public repository exists, point that at `github.com/rera/flagstage-core` and a release tag. Until then, this branch is the source.

Replace every example secret. Set `image` to the registry you pushed. Leave `ai_mock = "1"` until you want real edits. For real edits, set `ai_mock = "0"` and set `ai_api_key`. Set `bootstrap_admin_email` to the first admin. That address receives a one-time link in the web container logs, only while the database has no users.

Leave `create_route53_records` at its default, false, unless `app_domain` lives in one Route 53 hosted zone. Then set `create_route53_records = true` and `route53_zone_id`. Site hostnames are never created by the module. Previews are a path on the app hostname.

## 3. Plan

From the example directory:

```bash
tofu init
tofu plan
```

Read the plan. It should want a VPC (or none, for the existing-VPC example), a database, a bucket, a load balancer, an ECS service, and a CloudFront multi-tenant distribution. It should not want a NAT gateway.

`tofu plan` does not create resources. Apply only when the plan matches the account you meant:

```bash
tofu apply
```

State stays in the example directory unless you configure a remote backend. Move the state somewhere durable before this is the copy you depend on.

## 4. Create the app DNS records

`tofu output dns_records` prints the records to create:

| Name                 | Type       | Points at                     | Purpose                                   |
| -------------------- | ---------- | ----------------------------- | ----------------------------------------- |
| The app hostname     | A or ALIAS | The load balancer DNS name    | The Flagstage app                         |
| Each site hostname   | CNAME      | The connection-group endpoint | Published sites, created later in the app |

The app certificate's validation CNAMEs show up in the AWS console until ACM marks the certificate issued. Create those too. The module does not talk to a registrar.

Wait until the certificate is issued and the app hostname resolves. Then open `https://{app domain}`.

## 5. Sign in and finish setup

If you set `bootstrap_admin_email`, the web log prints `{APP_URL}/bootstrap?token=…` once. Open it. The link signs that person in as an admin and then stops working.

Sign in with the one-time link from the web log. The first admin email is `adminEmail` in `flagstage.config.json`. Create an account, then import a site.

The task environment sets `DOMAINS_DRIVER=cloudfront-tenants` and the distribution, connection group, and KeyValueStore ids. Adding a hostname in the app creates a distribution tenant and a managed certificate. You still create the DNS records the checklist shows. See [DNS checklist](../domains.md).

## 6. Import and publish

Create an account, import a site, go live, and request a change in chat. Visitors hit CloudFront, which reads the hostname from the KeyValueStore and serves that site's snapshot from the private bucket. The app serves the staff UI and the previews, not the public site.
