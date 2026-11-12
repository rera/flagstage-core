<!-- copy-review: required before announce -->

# FAQ

## Does Flagstage Core phone home?

No. There is no telemetry and no update check.

## Where do visitors' requests go?

To CloudFront, then to the current snapshot in object storage. The app serves previews and the local demo, not production traffic.

## Can we use our identity provider?

Yes, if it speaks OIDC or SAML 2.0. SCIM 2.0 provisions users and groups. Map a group id to a role. Names are labels, not rules.

## Do we have to bring a model key?

For real edits, yes. `AI_MOCK=1` runs the local demo without one.

## What is the difference between hosted Flagstage and this repository?

Hosted Flagstage is the operated service at https://flagstage.com. This repository is the software you run yourself. It does not include billing.
