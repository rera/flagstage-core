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

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
${rows}

## Drivers

- \`STORAGE_DRIVER=fs\` stores bytes on disk. Compose uses this so a local demo needs no object store.
- \`STORAGE_DRIVER=s3\` talks to AWS or any S3-compatible endpoint (\`S3_ENDPOINT\`, \`S3_FORCE_PATH_STYLE\`).
- \`HOSTMAP_DRIVER=fs\` writes the live hostname map next to the files. \`cloudfront-kvs\` updates a CloudFront KeyValueStore.
- \`DOMAINS_DRIVER=none\` still builds the DNS checklist. \`cloudfront-tenants\` creates or updates a distribution tenant and its managed certificate, then reads that status into the checklist.
- \`AI_MOCK=1\` skips provider calls. The worker applies a deterministic edit so chat, preview, and publish can be tried with no key.

## Telemetry

There is no telemetry. The app does not check for updates and does not send usage anywhere.
`;
}
