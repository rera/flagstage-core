<!-- copy-review: required before announce -->

# Self-hosting on AWS

The supported shape is one ECS service (web and worker containers, same image), RDS Postgres, S3, and CloudFront in front of the snapshots. The OpenTofu module in `infra/opentofu` creates it. This page is completed with that module.

Do not apply the module from a pull request bot. An operator runs OpenTofu in their own account.

Rough monthly cost before traffic and model usage is about $83 in us-east-1: Fargate 1 vCPU / 2 GB, one load balancer, three public IPv4 addresses, and a `db.t4g.micro`. The module README carries the line items.
