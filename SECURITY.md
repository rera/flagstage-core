# Security policy

## Supported versions

| Version         | Supported |
| --------------- | --------- |
| 0.1.x (current) | Yes       |
| Older tags      | No        |

Security fixes ship on the latest minor of the current major. Upgrade by following `docs/upgrading.md`.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository. Do not open a public issue for an unfixed vulnerability.

If private reporting is not enabled yet, email security@flagstage.com with the subject "Flagstage Core vulnerability". Include steps to reproduce, the version or git revision, and whether the issue is reachable on a default `docker compose` install.

We aim to acknowledge a report within 3 business days and to ship a fix or a mitigation plan within 30 days for issues we confirm. We will credit reporters in the advisory unless you ask us not to.

## Scope

In scope: the application, the worker, the container image, the CloudFormation stack, authentication, the import fetcher, preview tokens, and publish compare-and-swap.

Out of scope: vulnerabilities that require a compromised host, a leaked `BETTER_AUTH_SECRET`, or a model provider account you configured yourself. The coding agent is intentionally limited to files in a temp directory; a report that it can edit those files is expected.

## Deployment notes

- Set a unique `BETTER_AUTH_SECRET` of at least 32 characters.
- Do not expose Postgres or the metrics endpoint without `METRICS_TOKEN`.
- The OpenCode subprocess receives only the model key and model settings. It does not receive `DATABASE_URL` or cloud credentials.
- Flagstage Core does not phone home.
