import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { runSubprocessEdit } from "./subprocess";

const credentialKeys = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_ROLE_ARN"
] as const;

function awsCredentialsPresent(): boolean {
  const env = process.env;
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) return true;
  if (env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || env.AWS_CONTAINER_CREDENTIALS_FULL_URI) {
    return true;
  }
  if (env.AWS_WEB_IDENTITY_TOKEN_FILE && env.AWS_ROLE_ARN) return true;
  if (env.AWS_PROFILE) return true;
  return false;
}

// The image runs this same editor as the non-root user. Bedrock auth there is
// the task role. This test uses whatever credentials the process already has,
// and it does not run in CI without them.
describe.skipIf(!awsCredentialsPresent())("opencode on Bedrock", () => {
  it("edits a tiny site", async () => {
    const version = spawnSync("opencode", ["--version"], { encoding: "utf8" });
    expect(version.status, version.stderr || version.error?.message).toBe(0);
    const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
    const model = process.env.AGENT_MODEL ?? "amazon.nova-micro-v1:0";
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      LANG: process.env.LANG ?? "C.UTF-8",
      AWS_REGION: region,
      AWS_DEFAULT_REGION: region,
      AGENT_MODEL: model
    };
    for (const key of credentialKeys) {
      const value = process.env[key];
      if (value) env[key] = value;
    }
    const result = await runSubprocessEdit({
      bin: "opencode",
      files: new Map([
        [
          "index.html",
          new TextEncoder().encode(
            "<!doctype html><html><body><h1>Parks</h1><p>Welcome.</p></body></html>"
          )
        ]
      ]),
      request: "Add a sentence that says the park is open today.",
      env,
      timeoutMs: 180_000
    });
    const html = new TextDecoder().decode(result.files.get("index.html") ?? new Uint8Array());
    expect(result.changed).toBe(true);
    expect(html.toLowerCase()).toContain("open today");
  }, 180_000);
});
