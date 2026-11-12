import { describe, expect, it } from "vitest";

import { probeModel } from "./probe";

describe("model key probe", () => {
  it("reports a missing key without calling out", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("no");
    };
    expect(await probeModel({ provider: "openai", model: "m", fetchImpl })).toEqual({
      ok: false,
      code: "no-key"
    });
    expect(await probeModel({ provider: "bedrock", model: "m", fetchImpl })).toEqual({
      ok: false,
      code: "bedrock"
    });
    expect(called).toBe(false);
  });

  it("sends one token and does not echo the key", async () => {
    let seen = "";
    const fetchImpl: typeof fetch = async (url, init) => {
      seen = `${url}\n${JSON.stringify(init?.headers)}`;
      return new Response("{}", { status: 200 });
    };
    const result = await probeModel({
      provider: "anthropic",
      apiKey: "sk-live",
      model: "claude-haiku-4-5",
      fetchImpl
    });
    expect(result).toEqual({ ok: true, code: "ok", status: 200 });
    expect(seen).toContain("https://api.anthropic.com/v1/messages");
    expect(seen).toContain("sk-live");
    expect(JSON.stringify(result)).not.toContain("sk-live");
    const rejected = await probeModel({
      provider: "openai",
      apiKey: "sk-live",
      model: "gpt",
      fetchImpl: async () => new Response("bad", { status: 401 })
    });
    expect(rejected).toEqual({ ok: false, code: "rejected", status: 401 });
  });
});
