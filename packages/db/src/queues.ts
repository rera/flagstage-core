export const QUEUE_NAMES = [
  "import",
  "agent-turn",
  "publish",
  "dns-check",
  "analytics-rollup",
  "domain-recheck"
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
