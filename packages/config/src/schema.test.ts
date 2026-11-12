import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { renderConfigurationMarkdown } from "./docs";
import { ConfigError, loadConfig } from "./schema";

const valid = {
  DATABASE_URL: "postgres://flagstage:flagstage@localhost:5432/flagstage",
  BETTER_AUTH_SECRET: "local-dev-secret-that-is-long-enough",
  APP_URL: "http://localhost:3000",
  PREVIEW_DOMAIN: "localhost"
};

describe("loadConfig", () => {
  it("applies defaults for a local install", () => {
    const config = loadConfig(valid);
    expect(config.STORAGE_DRIVER).toBe("fs");
    expect(config.AI_MOCK).toBe(false);
    expect(config.IMPORT_MAX_PAGES).toBe(500);
    expect(config.EMAIL_PASSWORD_ENABLED).toBe(true);
    expect(config.ANALYTICS_ENABLED).toBe(true);
    expect(config.AGENT_TIMEOUT_SEC).toBe(600);
  });

  it("lists every invalid field in one error", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("BETTER_AUTH_SECRET");
      expect(message).toContain("APP_URL");
      expect(message).toContain("PREVIEW_DOMAIN");
    }
  });

  it("rejects placeholder secrets in production", () => {
    expect(() =>
      loadConfig({
        ...valid,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "replace-me-with-32-chars-minimum-secret"
      })
    ).toThrow(/unique secret/);
  });

  it("requires a bucket when storage is s3", () => {
    expect(() => loadConfig({ ...valid, STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
  });

  it("accepts mock mode without an API key", () => {
    const config = loadConfig({ ...valid, AI_MOCK: "1", NODE_ENV: "production" });
    expect(config.AI_MOCK).toBe(true);
    expect(config.AI_API_KEY).toBeUndefined();
  });

  it("keeps docs/configuration.md in sync with the schema", () => {
    const file = readFileSync(
      resolve(import.meta.dirname, "../../../docs/configuration.md"),
      "utf8"
    );
    expect(file).toBe(renderConfigurationMarkdown());
  });
});
