<!-- copy-review: required before announce -->

# Deploy on AWS

Edit `flagstage.config.json`, then run `./deploy.sh`. The script builds the image, pushes it to ECR in your account, and runs `aws cloudformation deploy`. Delegate the domain to the name servers the stack prints. Nothing in this repository runs that script.

Deploy the stack in us-east-1. CloudFront can only use a certificate from that region. The example config uses us-east-1.

The stack creates:

- A Route 53 hosted zone for `domain`, and the NS records to delegate.
- An ACM certificate for the domain and `*.domain`, validated in that zone.
- A VPC with two public and two private subnets, no NAT gateway.
- One Fargate service. The web and worker containers share one image, one task, 1 vCPU, and 2 GB.
- An application load balancer for the app hostname.
- RDS Postgres `db.t4g.micro`, 20 GB, encrypted, not public.
- A private S3 bucket and a CloudFront distribution. Published sites are read from the bucket. The app is not on that path.
- An SES domain identity and its three DKIM records in the zone.
- Bedrock invoke permission on the task role. There is no model API key.
- Secrets Manager entries for the database URL and the auth secret. The auth secret is generated.
- A log group.

The app is `https://{domain}`. A published site is `https://{slug}.{domain}`.

## Cost

About **$83 per month** in us-east-1 before traffic and model usage:

| Piece | About |
| --- | --- |
| Fargate, 1 vCPU and 2 GB, always on | $36 |
| Application load balancer | $22 |
| Three public IPv4 addresses | $11 |
| RDS `db.t4g.micro`, 20 GB, encrypted | $13 |
| S3, CloudFront, logs, secrets | $1 |
| **Total** | **$83** |

A NAT gateway is not included. Bedrock usage is extra.
