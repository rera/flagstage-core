export { checkTrust, decideIntent } from "@flagstage/ai";
export type { Intent } from "@flagstage/ai";

export function buildAgentEnv(env: Record<string, string | undefined>): Record<string, string> {
  const allow = [
    "PATH",
    "HOME",
    "LANG",
    "AI_MODEL_SMALL",
    "AGENT_MODEL",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
    "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN",
    "CORRELATION_ID"
  ];
  const out: Record<string, string> = {};
  for (const key of allow) {
    const value = env[key];
    if (value) out[key] = value;
  }
  return out;
}
