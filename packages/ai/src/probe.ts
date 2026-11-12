export type ProbeCode =
  "mock" | "no-key" | "bedrock" | "needs-base-url" | "ok" | "rejected" | "unreachable";

export type ProbeResult = { ok: boolean; code: ProbeCode; status?: number };

export type ProbeInput = {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  mock: boolean;
  fetchImpl?: typeof fetch;
};

type Call = { url: string; headers: Record<string, string>; body: unknown };

function chatCall(
  url: string,
  apiKey: string,
  model: string,
  header: "authorization" | "api-key"
): Call {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (header === "authorization") headers.authorization = `Bearer ${apiKey}`;
  else headers["api-key"] = apiKey;
  return {
    url,
    headers,
    body: { model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }
  };
}

function requestFor(input: ProbeInput): Call | ProbeResult {
  const key = input.apiKey?.trim();
  const base = input.baseUrl?.replace(/\/$/, "");
  if (input.provider === "bedrock") return { ok: false, code: "bedrock" };
  if (!key) return { ok: false, code: "no-key" };
  if (input.provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: { model: input.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }
    };
  }
  if (input.provider === "openai") {
    return chatCall(
      "https://api.openai.com/v1/chat/completions",
      key,
      input.model,
      "authorization"
    );
  }
  if (input.provider === "openrouter") {
    return chatCall(
      "https://openrouter.ai/api/v1/chat/completions",
      key,
      input.model,
      "authorization"
    );
  }
  if (input.provider === "google") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: { contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } }
    };
  }
  if (input.provider === "azure") {
    if (!base) return { ok: false, code: "needs-base-url" };
    return chatCall(
      `${base}/openai/deployments/${encodeURIComponent(input.model)}/chat/completions?api-version=2024-10-21`,
      key,
      input.model,
      "api-key"
    );
  }
  if (!base) return { ok: false, code: "needs-base-url" };
  return chatCall(`${base}/chat/completions`, key, input.model, "authorization");
}

/** One-token call used by Settings to confirm a model key. The key is not returned. */
export async function probeModel(input: ProbeInput): Promise<ProbeResult> {
  if (input.mock) return { ok: false, code: "mock" };
  const planned = requestFor(input);
  if ("code" in planned) return planned;
  try {
    const response = await (input.fetchImpl ?? fetch)(planned.url, {
      method: "POST",
      headers: planned.headers,
      body: JSON.stringify(planned.body),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return { ok: false, code: "rejected", status: response.status };
    return { ok: true, code: "ok", status: response.status };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}
