import { ENV_FIELDS } from "./fields";

export function renderConfigurationMarkdown(): string {
  const rows = ENV_FIELDS.map((field) => {
    const required = field.requirement === "always" ? "yes" : "no";
    const fallback = "defaultValue" in field ? (field.defaultValue ?? "") : "";
    return `| \`${field.name}\` | ${required} | \`${fallback}\` | ${field.description} |`;
  }).join("\n");

  return `<!-- copy-review: required before announce -->

# Configuration

Flagstage Core reads configuration from the environment. The schema in
\`packages/config\` validates it at boot and prints every problem at once.
This page is generated from that schema. Do not edit it by hand.
Regenerate it with \`pnpm docs:config\`.

Secrets have no production default. A placeholder \`BETTER_AUTH_SECRET\` is
rejected when \`NODE_ENV=production\`.

Organization name, domain, the first admin, the Bedrock model, the region,
the SES from-address, and the brand live in \`flagstage.config.json\` at the
repository root. \`flagstage.config.schema.json\` is the schema. The auth
secret is not in that file. The stack creates it in Secrets Manager.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
${rows}

## Drivers

- \`STORAGE_DRIVER=fs\` stores bytes on disk. Compose uses this so a local checkout needs no object store.
- \`STORAGE_DRIVER=s3\` talks to AWS or any S3-compatible endpoint (\`S3_ENDPOINT\`, \`S3_FORCE_PATH_STYLE\`).
- \`HOSTMAP_DRIVER=fs\` writes the live hostname map next to the files. \`cloudfront-kvs\` updates a CloudFront KeyValueStore.
- \`DOMAINS_DRIVER=none\` still builds the DNS checklist. \`cloudfront-tenants\` creates or updates a distribution tenant and its managed certificate, then reads that status into the checklist.
- Chat runs OpenCode in one Lambda. OpenCode uses the amazon-bedrock provider and the task role. There is no model API key.

## Telemetry

There is no telemetry. The app does not check for updates and does not send usage anywhere.
`;
}
