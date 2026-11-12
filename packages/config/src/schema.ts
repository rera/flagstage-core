import { z } from "zod";

import { ENV_FIELDS, PLACEHOLDER_SECRETS } from "./fields";
import { ConfigError } from "./errors";
import { findConfigFile, loadFileConfig, type FileConfig } from "./file";

function blankToUndefined(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

const boolish = z.preprocess(
  blankToUndefined,
  z
    .enum(["0", "1", "true", "false", "yes", "no"])
    .default("0")
    .transform((value) => value === "1" || value === "true" || value === "yes")
);

const optionalString = z.preprocess(blankToUndefined, z.string().min(1).optional());

const intWithDefault = (fallback: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? String(fallback) : value),
    z.coerce.number().int().positive()
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    APP_URL: z.string().url(),
    STORAGE_DRIVER: z.enum(["fs", "s3"]).default("fs"),
    S3_BUCKET: optionalString,
    S3_REGION: optionalString,
    S3_ENDPOINT: optionalString,
    S3_FORCE_PATH_STYLE: boolish,
    FS_STORAGE_DIR: z.preprocess(blankToUndefined, z.string().min(1).default(".data/storage")),
    HOSTMAP_DRIVER: z.enum(["fs", "cloudfront-kvs"]).default("fs"),
    CLOUDFRONT_KVS_ARN: optionalString,
    CLOUDFRONT_DISTRIBUTION_ID: optionalString,
    CLOUDFRONT_CONNECTION_GROUP_ENDPOINT: optionalString,
    CLOUDFRONT_CONNECTION_GROUP_ID: optionalString,
    DOMAINS_DRIVER: z.enum(["none", "cloudfront-tenants"]).default("none"),
    AI_MODEL_SMALL: z.preprocess(
      blankToUndefined,
      z.string().min(1).default("amazon.nova-micro-v1:0")
    ),
    AGENT_MODEL: z.preprocess(
      blankToUndefined,
      z.string().min(1).default("amazon.nova-micro-v1:0")
    ),
    AGENT_TIMEOUT_SEC: intWithDefault(600),
    MAIL_FROM: optionalString,
    FORM_NOTIFY_EMAIL: optionalString,
    EMAIL_PASSWORD_ENABLED: z.preprocess(
      (value) => (value === undefined || value === "" ? "1" : value),
      z
        .enum(["0", "1", "true", "false", "yes", "no"])
        .transform((value) => value === "1" || value === "true" || value === "yes")
    ),
    IMPORT_MAX_PAGES: intWithDefault(500),
    IMPORT_MAX_DEPTH: intWithDefault(6),
    IMPORT_MAX_ASSETS: intWithDefault(10_000),
    ANALYTICS_ENABLED: z.preprocess(
      (value) => (value === undefined || value === "" ? "1" : value),
      z
        .enum(["0", "1", "true", "false", "yes", "no"])
        .transform((value) => value === "1" || value === "true" || value === "yes")
    ),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    METRICS_TOKEN: optionalString
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production") {
      if (
        PLACEHOLDER_SECRETS.has(value.BETTER_AUTH_SECRET) ||
        value.BETTER_AUTH_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BETTER_AUTH_SECRET"],
          message: "Production requires a unique secret of at least 32 characters."
        });
      }
    }
    if (value.STORAGE_DRIVER === "s3") {
      if (!value.S3_BUCKET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["S3_BUCKET"],
          message: "S3_BUCKET is required when STORAGE_DRIVER=s3."
        });
      }
      if (!value.S3_REGION) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["S3_REGION"],
          message: "S3_REGION is required when STORAGE_DRIVER=s3."
        });
      }
    }
    if (value.HOSTMAP_DRIVER === "cloudfront-kvs" && !value.CLOUDFRONT_KVS_ARN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLOUDFRONT_KVS_ARN"],
        message: "CLOUDFRONT_KVS_ARN is required when HOSTMAP_DRIVER=cloudfront-kvs."
      });
    }
    if (value.DOMAINS_DRIVER === "cloudfront-tenants") {
      if (!value.CLOUDFRONT_DISTRIBUTION_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLOUDFRONT_DISTRIBUTION_ID"],
          message: "CLOUDFRONT_DISTRIBUTION_ID is required when DOMAINS_DRIVER=cloudfront-tenants."
        });
      }
      if (!value.CLOUDFRONT_CONNECTION_GROUP_ENDPOINT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLOUDFRONT_CONNECTION_GROUP_ENDPOINT"],
          message:
            "CLOUDFRONT_CONNECTION_GROUP_ENDPOINT is required when DOMAINS_DRIVER=cloudfront-tenants."
        });
      }
      if (!value.CLOUDFRONT_CONNECTION_GROUP_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLOUDFRONT_CONNECTION_GROUP_ID"],
          message:
            "CLOUDFRONT_CONNECTION_GROUP_ID is required when DOMAINS_DRIVER=cloudfront-tenants."
        });
      }
    }
  });

export type Config = z.infer<typeof envSchema> & {
  product?: FileConfig;
  productPath?: string;
};

export { ConfigError } from "./errors";

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const picked: Record<string, string | undefined> = {};
  for (const field of ENV_FIELDS) {
    picked[field.name] = source[field.name];
  }
  let product: FileConfig | undefined;
  let productPath: string | undefined;
  if (source === process.env && process.env.NEXT_PHASE !== "phase-production-build") {
    productPath = findConfigFile();
    if (productPath) {
      product = loadFileConfig(productPath);
      picked.MAIL_FROM ??= product.sesFrom;
      picked.S3_REGION ??= product.region;
      picked.AI_MODEL_SMALL ??= product.bedrockModelId;
      picked.AGENT_MODEL ??= product.bedrockModelId;
    } else if ((picked.NODE_ENV ?? process.env.NODE_ENV) === "production") {
      throw new ConfigError(
        "Missing flagstage.config.json. Add it in the working directory or set FLAGSTAGE_CONFIG."
      );
    }
  }
  const parsed = envSchema.safeParse(picked);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "config";
      return `- ${path}: ${issue.message}`;
    });
    throw new ConfigError(`Invalid configuration:\n${lines.join("\n")}`);
  }
  return { ...parsed.data, product, productPath };
}

export function appOrigin(config: Config): URL {
  return new URL(config.APP_URL);
}
