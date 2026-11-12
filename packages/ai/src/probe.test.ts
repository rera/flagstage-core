import { describe, expect, it } from "vitest";

import { probeBedrock } from "./probe";

describe("Bedrock access check", () => {
  it("does not call AWS when the region or model is missing", async () => {
    let called = false;
    const result = await probeBedrock({
      region: "",
      modelId: "amazon.nova-micro-v1:0",
      send: async () => {
        called = true;
      }
    });
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("reports the outcome of the injected call", async () => {
    const ok = await probeBedrock({
      region: "us-east-1",
      modelId: "amazon.nova-micro-v1:0",
      send: async () => undefined
    });
    expect(ok).toEqual({ ok: true, detail: "Bedrock answered." });
    const failed = await probeBedrock({
      region: "us-east-1",
      modelId: "amazon.nova-micro-v1:0",
      send: async () => {
        throw new Error("AccessDenied");
      }
    });
    expect(failed.ok).toBe(false);
    expect(failed.detail).toContain("AccessDenied");
  });
});
