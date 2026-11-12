<!-- copy-review: required before announce -->

# Single virtual machine

`docker compose up` is an evaluation install. It is not the supported production layout. There is no failover. Published files are not served by the app. `pnpm dev:sites` can show them locally. On AWS they go from S3 to CloudFront.

Use it to try an import. For a real deployment, use `./deploy.sh`.
