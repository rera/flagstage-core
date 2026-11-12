import pino from "pino";

import { correlationMixin } from "./correlation";
import type { Config } from "./schema";

export function createLogger(config: Pick<Config, "LOG_LEVEL">, name = "flagstage") {
  return pino({
    name,
    level: config.LOG_LEVEL,
    base: { service: name },
    mixin: correlationMixin,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
