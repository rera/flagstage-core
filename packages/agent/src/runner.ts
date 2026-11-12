import { decideIntent } from "@flagstage/ai";

export { checkTrust, decideIntent } from "@flagstage/ai";
export type { Intent } from "@flagstage/ai";

export function buildAgentEnv(env: Record<string, string | undefined>): Record<string, string> {
  const allow = [
    "PATH",
    "HOME",
    "LANG",
    "AI_API_KEY",
    "AI_BASE_URL",
    "AI_MODEL_SMALL",
    "AGENT_MODEL",
    "AI_MOCK"
  ];
  const out: Record<string, string> = {};
  for (const key of allow) {
    const value = env[key];
    if (value) out[key] = value;
  }
  return out;
}

export async function mockEdit(
  files: Map<string, Uint8Array>,
  request: string
): Promise<{ changed: boolean; files: Map<string, Uint8Array> }> {
  if (decideIntent(request).kind === "satisfied") return { changed: false, files };
  const key = [...files.keys()].find((name) => name.endsWith("index.html"));
  if (!key) return { changed: false, files };
  const html = new TextDecoder().decode(files.get(key));
  const note = `<!-- ${request.replaceAll("--", "")} -->`;
  if (html.includes(note)) return { changed: false, files };
  const next = html.includes("</body>")
    ? html.replace("</body>", `${note}</body>`)
    : `${html}\n${note}`;
  const copy = new Map(files);
  copy.set(key, new TextEncoder().encode(next));
  return { changed: true, files: copy };
}
