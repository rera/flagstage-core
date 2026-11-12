<!-- copy-review: required before announce -->

# Roadmap

Flagstage Core 0.1 is the self-hosted loop: import a site, request a change in chat, preview it, and publish it. The items below are the public direction. They are not commitments.

Discuss proposals in [GitHub Discussions](https://github.com/rera/flagstage-core/discussions) before opening a feature request.

## Now

- WordPress import, chat edits, preview, approve, publish, and rollback.
- Organization, accounts, invites, OIDC, SAML, and SCIM.
- Custom-domain DNS checklist.
- Lead forms and basic analytics.
- OpenTofu module for a single ECS service.

## Next

- More import sources than WordPress, still static output.
- A documented `ecs-task` agent runner for stronger isolation than the in-container subprocess.
- Backup and restore commands that cover database and object storage in one invocation.
- Helm chart, if operators ask for Kubernetes.

## Later

- Optional publish of libraries for teams that want to embed preview and publish.
- A docs site generated from `docs/`.
- Additional languages in the message catalog.

## Not planned

- Billing, plans, or a hosted signup funnel inside this repository.
- Inbound email, SMS, or Slack as a way to request a change.
- Provider-specific identity clients. Standards only.
- Phone-home telemetry.
