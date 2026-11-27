import pino, { type DestinationStream, type Logger } from "pino";

import type { Config } from "./schema";

const LOG_LEVELS = new Set(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

/** CloudWatch namespace for failure counts. The stack alarms use the same name. */
export const FAILURE_NAMESPACE = "Flagstage";

/** One count per failed operation. Values are the CloudWatch metric names. */
export const FAILURE_METRICS = {
  chat: "FailedChatTurns",
  import: "FailedImports",
  publish: "FailedPublishes"
} as const;

export type FailureKind = keyof typeof FAILURE_METRICS;

export function createLogger(
  config: Pick<Config, "LOG_LEVEL">,
  name = "flagstage",
  destination?: DestinationStream
): Logger {
  const options = {
    name,
    level: config.LOG_LEVEL,
    base: { service: name },
    timestamp: pino.stdTimeFunctions.isoTime
  };
  return destination ? pino(options, destination) : pino(options);
}

/**
 * Embedded metric format for one failure. CloudWatch Logs extracts it from the
 * pino line, so callers do not call PutMetricData.
 */
export function failureFields(kind: FailureKind, now = Date.now()) {
  const name = FAILURE_METRICS[kind];
  return {
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [
        {
          Namespace: FAILURE_NAMESPACE,
          Metrics: [{ Name: name, Unit: "Count" }]
        }
      ]
    },
    [name]: 1
  };
}

export function failureLogger(name = "flagstage"): Logger {
  const raw = process.env.LOG_LEVEL ?? "";
  const level = LOG_LEVELS.has(raw) ? (raw as Config["LOG_LEVEL"]) : "info";
  return createLogger({ LOG_LEVEL: level }, name);
}

/** Log one failure. The metric fields sit on the same line as the message. */
export function emitFailure(
  log: Logger,
  kind: FailureKind,
  fields: Record<string, unknown> = {},
  message?: string
) {
  const name = FAILURE_METRICS[kind];
  log.error({ ...fields, ...failureFields(kind) }, message ?? name);
}
