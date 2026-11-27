<!-- copy-review: required before announce -->

# Deploy on AWS

Edit `flagstage.config.json`, then run `./deploy.sh`. The script deploys the CloudFormation template. `ImageUri` defaults to `public.ecr.aws/rera/flagstage-core:0.1.0`. `LambdaImageUri` defaults to `public.ecr.aws/rera/flagstage-core:0.1.0-lambda`. `./deploy.sh --build` builds both images and pushes them to ECR in your account. Delegate the domain to the name servers the stack prints. Nothing in this repository runs that script. A GitHub release attaches the same template and puts a Launch stack link in the notes.

Deploy the stack in us-east-1. CloudFront can only use a certificate from that region. The example config uses us-east-1.

The stack creates:

- A Route 53 hosted zone for `domain`, and the NS records to delegate.
- An ACM certificate for the domain and `*.domain`, validated in that zone.
- A VPC with two public and two private subnets, no NAT gateway.
- One Fargate service for the web container, 1 vCPU and 2 GB, always on, with 100 GB of ephemeral disk. Go live downloads the snapshot onto that disk. Chat is one Lambda with 10 GB of ephemeral disk (the Lambda maximum; the default 512 MB is too small for the same download). Imports are one-off tasks in the same cluster, 2 vCPU and 4 GB, on the public subnets.
- An application load balancer for the app hostname.
- RDS Postgres `db.t4g.micro`, 20 GB, encrypted, not public.
- A private S3 bucket and a CloudFront distribution. Published sites are read from the bucket. The app is not on that path. One key value store holds each hostname's live snapshot prefix and that site's redirects. The viewer-request function reads only that store.
- An SES domain identity and its three DKIM records in the zone.
- Bedrock invoke permission on the web task role and the chat Lambda role, and a Bedrock interface endpoint on the private subnets. The import task role can call `bedrock:InvokeModel` only for the importer decision model (default Claude Haiku 4.5, `global.anthropic.claude-haiku-4-5-20251001-v1:0`) and the foundation model behind it. The running import reads that model id from the database. The stack parameters `ImporterDecisionModelId` and `ImporterFoundationModelId` only scope the role. There is no model API key. The import task uses its public IP to reach Bedrock. The interface endpoint is for the chat Lambda.
- An optional budget topic. The admin usage log publishes one alert a month when an account crosses its budget.
- An alarm topic and five CloudWatch alarms. See [Alarms](#alarms).
- Secrets Manager entries for the database URL and the auth secret. The auth secret is generated.
- A log group.

The app is `https://{domain}`. A published site is `https://{slug}.{domain}`.

## Redirects at the edge

Stored redirects stay in Postgres. Publish copies them into the key value store. A redirect key is the hostname plus the path. A query string is part of the key, so `/?p=ID` is its own redirect, and the same path on another hostname is another key. The value is the target path. The function answers 301 when a key matches. Otherwise it rewrites the request onto the published files. Keys for that site that are no longer in Postgres are deleted. The hostname prefix key has no slash and is left in place.

CloudFront limits one key value store to 5 MB (5,242,880 bytes). A key can be 512 bytes and a value 1 KB. One update accepts at most 50 keys. Those limits are not adjustable. Publish measures the site, including one copy of each redirect per hostname, and stops before going live if a key, a value, or that site's map would exceed the limit. The error names the limit. Nothing is written for that site when the check fails. When the web task can reach the store, it also stops before going live if the write would push the shared store over 5 MB.

The web task role can describe the store, list its keys, and update them. The import task role has no key value store access. A scheduled publish that runs in the chat Lambda checks the per-site limits before it moves the live pointer. The Lambda has no route to the CloudFront API, so the web task writes the keys and applies the shared-store check.

## Alarms

Deploying the stack is enough. Failed chat turns, imports, and publishes are written on the existing error log as [CloudWatch embedded metric format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html) in the `Flagstage` namespace. CloudWatch Logs turns those lines into metrics. There is no `PutMetricData` call. `LOG_LEVEL` must stay at `error` or more verbose (`info` is the default). `fatal` and `silent` drop the lines, and the failure alarms then see no data.

`AlarmEmail` is optional. Leave it empty and the topic has no subscription. Set it to an address to subscribe that address; the recipient has to confirm the message AWS sends. A pager can subscribe to the topic the stack prints.

Each alarm treats missing data as not breaching, so a quiet period does not page.

| Alarm              | Fires when                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| Failed chat turns  | `FailedChatTurns` sum is at least 1 in 5 minutes                           |
| Failed imports     | `FailedImports` sum is at least 1 in 5 minutes                             |
| Failed publishes   | `FailedPublishes` sum is at least 1 in 5 minutes                           |
| Chat Lambda errors | `AWS/Lambda` `Errors` for the chat function sum is at least 1 in 5 minutes |
| Web health         | Load balancer `UnHealthyHostCount` stays at least 1 for 3 minutes          |

The web alarm uses the target group's existing `GET /api/health` check. `UnHealthyHostCount` is that check, already published by the load balancer. A Route 53 health check would be another probe at about $0.50 a month, and a Synthetics canary is more. This alarm adds no probe.

Five standard alarms are about **$0.50** a month. The three failure metrics are about **$0.90**. Lambda and load balancer metrics are already included. The topic is free until it sends mail.

## Cost

About **$105 per month** in us-east-1 before traffic, model usage, and import tasks:

| Piece                                                  | About    |
| ------------------------------------------------------ | -------- |
| Fargate, 1 vCPU and 2 GB, always on                    | $36      |
| Fargate ephemeral disk, 80 GB above the 20 GB included | $6       |
| Application load balancer                              | $22      |
| Three public IPv4 addresses                            | $11      |
| RDS `db.t4g.micro`, 20 GB, encrypted                   | $13      |
| Bedrock interface endpoint, two AZs                    | $15      |
| S3, CloudFront, logs, secrets                          | $1       |
| Alarms and the three failure metrics                   | $1       |
| **Total**                                              | **$105** |

A NAT gateway is not included. The chat Lambda scales to zero unless `ProvisionedConcurrency` is 1. Import tasks and Bedrock usage are extra.
