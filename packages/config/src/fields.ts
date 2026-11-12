export type EnvRequirement = "always" | "optional";

export type EnvField = {
  name: string;
  description: string;
  requirement: EnvRequirement;
  secret: boolean;
  example: string;
  defaultValue?: string;
};

/**
 * Single source for environment variables. The zod schema and
 * docs/configuration.md are both derived from this list.
 */
export const ENV_FIELDS = [
  {
    name: "DATABASE_URL",
    description: "Postgres connection string. Required at boot.",
    requirement: "always",
    secret: true,
    example: "postgres://flagstage:flagstage@localhost:5432/flagstage"
  },
  {
    name: "BETTER_AUTH_SECRET",
    description:
      "Session signing secret. At least 32 characters. Required. Never commit a production value.",
    requirement: "always",
    secret: true,
    example: "replace-me-with-32-chars-minimum-secret"
  },
  {
    name: "APP_URL",
    description: "Public origin of the app, including scheme and no trailing slash.",
    requirement: "always",
    secret: false,
    example: "http://localhost:3000"
  },
  {
    name: "STORAGE_DRIVER",
    description:
      "Where snapshots and media are stored. fs for local disk, s3 for any S3-compatible store.",
    requirement: "optional",
    secret: false,
    example: "fs",
    defaultValue: "fs"
  },
  {
    name: "S3_BUCKET",
    description: "Bucket name. Required when STORAGE_DRIVER=s3.",
    requirement: "optional",
    secret: false,
    example: "flagstage-core"
  },
  {
    name: "S3_REGION",
    description: "Region for the S3 client. Required when STORAGE_DRIVER=s3.",
    requirement: "optional",
    secret: false,
    example: "us-east-1"
  },
  {
    name: "S3_ENDPOINT",
    description: "Optional S3-compatible endpoint. Leave unset for AWS.",
    requirement: "optional",
    secret: false,
    example: ""
  },
  {
    name: "S3_FORCE_PATH_STYLE",
    description: "Set to 1 for S3-compatible stores that require path-style addressing.",
    requirement: "optional",
    secret: false,
    example: "0",
    defaultValue: "0"
  },
  {
    name: "FS_STORAGE_DIR",
    description: "Directory used when STORAGE_DRIVER=fs.",
    requirement: "optional",
    secret: false,
    example: ".data/storage",
    defaultValue: ".data/storage"
  },
  {
    name: "HOSTMAP_DRIVER",
    description:
      "How the live hostname map is stored. fs writes a JSON file. cloudfront-kvs writes a CloudFront KeyValueStore.",
    requirement: "optional",
    secret: false,
    example: "fs",
    defaultValue: "fs"
  },
  {
    name: "CLOUDFRONT_KVS_ARN",
    description: "KeyValueStore ARN. Required when HOSTMAP_DRIVER=cloudfront-kvs.",
    requirement: "optional",
    secret: false,
    example: ""
  },
  {
    name: "CLOUDFRONT_DISTRIBUTION_ID",
    description: "Multi-tenant distribution id. Required when DOMAINS_DRIVER=cloudfront-tenants.",
    requirement: "optional",
    secret: false,
    example: ""
  },
  {
    name: "CLOUDFRONT_CONNECTION_GROUP_ENDPOINT",
    description:
      "Connection group endpoint operators CNAME to. Shown on the DNS checklist. Required when domains use CloudFront.",
    requirement: "optional",
    secret: false,
    example: ""
  },
  {
    name: "CLOUDFRONT_CONNECTION_GROUP_ID",
    description:
      "Connection group id for new distribution tenants. Required when DOMAINS_DRIVER=cloudfront-tenants.",
    requirement: "optional",
    secret: false,
    example: ""
  },
  {
    name: "DOMAINS_DRIVER",
    description:
      "none records DNS targets only. cloudfront-tenants also creates a distribution tenant per site.",
    requirement: "optional",
    secret: false,
    example: "none",
    defaultValue: "none"
  },
  {
    name: "AI_PROVIDER",
    description:
      "Provider for the small intent, judge, and reply models, and the default agent provider. One of anthropic, openai, bedrock, openrouter, openai-compatible, google, azure.",
    requirement: "optional",
    secret: false,
    example: "anthropic",
    defaultValue: "anthropic"
  },
  {
    name: "AI_API_KEY",
    description: "Bring-your-own model API key. Bedrock may use the task role instead of a key.",
    requirement: "optional",
    secret: true,
    example: ""
  },
  {
    name: "AI_BASE_URL",
    description: "Base URL for openai-compatible, openrouter, or a custom gateway.",
    requirement: "optional",
    secret: false,
    example: ""
  },
  {
    name: "AI_MODEL_SMALL",
    description: "Model id for intent, trust judge, and short replies.",
    requirement: "optional",
    secret: false,
    example: "claude-haiku-4-5",
    defaultValue: "claude-haiku-4-5"
  },
  {
    name: "AGENT_MODEL",
    description: "Model id passed to OpenCode for site edits.",
    requirement: "optional",
    secret: false,
    example: "claude-sonnet-4-5",
    defaultValue: "claude-sonnet-4-5"
  },
  {
    name: "AGENT_TIMEOUT_SEC",
    description: "Hard timeout for one agent turn, in seconds.",
    requirement: "optional",
    secret: false,
    example: "600",
    defaultValue: "600"
  },
  {
    name: "SMTP_URL",
    description:
      "Optional SMTP URL for invites and notices. When unset, mail is printed to the log.",
    requirement: "optional",
    secret: true,
    example: ""
  },
  {
    name: "MAIL_FROM",
    description: "From address used when SMTP_URL is set.",
    requirement: "optional",
    secret: false,
    example: "Flagstage Core <noreply@example.com>"
  },
  {
    name: "FORM_NOTIFY_EMAIL",
    description:
      "Optional addresses that receive a form submission when SMTP_URL is set. Separate several with commas. A form's own notify list is included too.",
    requirement: "optional",
    secret: false,
    example: "leads@example.com"
  },
  {
    name: "EMAIL_PASSWORD_ENABLED",
    description: "Set to 0 to turn off email and password sign-in.",
    requirement: "optional",
    secret: false,
    example: "1",
    defaultValue: "1"
  },
  {
    name: "IMPORT_MAX_PAGES",
    description: "Default page cap for an import.",
    requirement: "optional",
    secret: false,
    example: "500",
    defaultValue: "500"
  },
  {
    name: "IMPORT_MAX_DEPTH",
    description: "Default link depth for an import.",
    requirement: "optional",
    secret: false,
    example: "6",
    defaultValue: "6"
  },
  {
    name: "IMPORT_MAX_ASSETS",
    description: "Default asset cap for an import.",
    requirement: "optional",
    secret: false,
    example: "10000",
    defaultValue: "10000"
  },
  {
    name: "ANALYTICS_ENABLED",
    description:
      "Default for new sites. A site can turn analytics off. When off, the beacon is not injected.",
    requirement: "optional",
    secret: false,
    example: "1",
    defaultValue: "1"
  },
  {
    name: "LOG_LEVEL",
    description: "pino level: fatal, error, warn, info, debug, trace, or silent.",
    requirement: "optional",
    secret: false,
    example: "info",
    defaultValue: "info"
  },
  {
    name: "METRICS_TOKEN",
    description: "Bearer token required by /api/metrics. When unset, the endpoint responds 404.",
    requirement: "optional",
    secret: true,
    example: ""
  },
  {
    name: "NODE_ENV",
    description: "development, test, or production. Production refuses placeholder secrets.",
    requirement: "optional",
    secret: false,
    example: "development",
    defaultValue: "development"
  }
] as const satisfies readonly EnvField[];

export type EnvName = (typeof ENV_FIELDS)[number]["name"];

export const PLACEHOLDER_SECRETS = new Set([
  "replace-me-with-32-chars-minimum-secret",
  "change-me",
  "secret",
  "password"
]);
