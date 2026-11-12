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
    "AGENT_MODEL"
  ];
  const out: Record<string, string> = {};
  for (const key of allow) {
    const value = env[key];
    if (value) out[key] = value;
  }
  return out;
}
