<!-- copy-review: required before announce -->

# Deploy on AWS

Edit `flagstage.config.json`, then run `./deploy.sh`. The script deploys the CloudFormation template. `ImageUri` defaults to `public.ecr.aws/flagstage/flagstage-core:0.1.0`. `LambdaImageUri` defaults to `public.ecr.aws/flagstage/flagstage-core:0.1.0-lambda`. `./deploy.sh --build` builds both images and pushes them to ECR in your account. Delegate the domain to the name servers the stack prints. Nothing in this repository runs that script. A GitHub release attaches the same template and puts a Launch stack link in the notes.

Deploy the stack in us-east-1. CloudFront can only use a certificate from that region. The example config uses us-east-1.

The stack creates:

- A Route 53 hosted zone for `domain`, and the NS records to delegate.
- An ACM certificate for the domain and `*.domain`, validated in that zone.
- A VPC with two public and two private subnets, no NAT gateway.
- One Fargate service for the web container, 1 vCPU and 2 GB, always on. Chat is one Lambda. Imports are one-off tasks in the same cluster, on the public subnets.
- An application load balancer for the app hostname.
- RDS Postgres `db.t4g.micro`, 20 GB, encrypted, not public.
- A private S3 bucket and a CloudFront distribution. Published sites are read from the bucket. The app is not on that path.
- An SES domain identity and its three DKIM records in the zone.
- Bedrock invoke permission on the web task role and the chat Lambda role, and a Bedrock interface endpoint on the private subnets. There is no model API key.
- An optional budget topic. The admin usage log publishes one alert a month when an account crosses its budget.
- Secrets Manager entries for the database URL and the auth secret. The auth secret is generated.
- A log group.

The app is `https://{domain}`. A published site is `https://{slug}.{domain}`.

## Cost

About **$98 per month** in us-east-1 before traffic, model usage, and import tasks:

| Piece                                | About   |
| ------------------------------------ | ------- |
| Fargate, 1 vCPU and 2 GB, always on  | $36     |
| Application load balancer            | $22     |
| Three public IPv4 addresses          | $11     |
| RDS `db.t4g.micro`, 20 GB, encrypted | $13     |
| Bedrock interface endpoint, two AZs  | $15     |
| S3, CloudFront, logs, secrets        | $1      |
| **Total**                            | **$98** |

A NAT gateway is not included. The chat Lambda scales to zero unless `ProvisionedConcurrency` is 1. Import tasks and Bedrock usage are extra.
