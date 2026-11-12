import { describe, expect, it } from "vitest";

import { buildAgentEnv } from "./runner";
import { runSubprocessEdit, skillsDirectory } from "./subprocess";

describe("subprocess editor", () => {
  it("runs a local command without database or cloud credentials", async () => {
    const env = buildAgentEnv({
      PATH: process.env.PATH,
      DATABASE_URL: "postgres://secret",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_ACCESS_KEY_ID: "key"
    });
    const result = await runSubprocessEdit({
      bin: process.execPath,
      args: [
        "-e",
        "require('fs').appendFileSync('index.html', process.env.DATABASE_URL || process.env.AWS_SECRET_ACCESS_KEY || 'clean')"
      ],
      files: new Map([["index.html", new TextEncoder().encode("<html></html>")]]),
      request: "Add a note",
      env,
      timeoutMs: 10_000,
      skillsDir: skillsDirectory
    });
    const html = new TextDecoder().decode(result.files.get("index.html"));
    expect(html).toContain("clean");
    expect(html).not.toContain("postgres://secret");
    expect(result.changed).toBe(true);
  });
});
