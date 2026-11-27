import { readFileSync } from "node:fs";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FAILURE_METRICS,
  FAILURE_NAMESPACE,
  createLogger,
  emitFailure,
  failureFields
} from "./logger";

function capture() {
  const chunks: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    }
  });
  return {
    destination,
    lines(): Array<Record<string, unknown>> {
      return chunks
        .join("")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    }
  };
}

describe("failure metrics", () => {
  it("emits one embedded count for each failure kind", () => {
    const now = 1_700_000_000_000;
    for (const kind of ["chat", "import", "publish"] as const) {
      const name = FAILURE_METRICS[kind];
      const fields = failureFields(kind, now);
      expect(fields[name]).toBe(1);
      expect(fields._aws).toEqual({
        Timestamp: now,
        CloudWatchMetrics: [
          {
            Namespace: FAILURE_NAMESPACE,
            Metrics: [{ Name: name, Unit: "Count" }]
          }
        ]
      });
    }
  });

  it("writes the metric on the pino error line", () => {
    const output = capture();
    const log = createLogger({ LOG_LEVEL: "info" }, "import", output.destination);
    const error = new Error("boom");
    emitFailure(log, "import", { err: error, importRunId: "run-1" }, "import failed");
    const [line] = output.lines();
    expect(line?.msg).toBe("import failed");
    expect(line?.service).toBe("import");
    expect(line?.FailedImports).toBe(1);
    expect(line?.importRunId).toBe("run-1");
    const err = line?.err as { message?: string };
    expect(err.message).toBe("boom");
    const aws = line?._aws as {
      CloudWatchMetrics: Array<{ Namespace: string; Metrics: Array<{ Name: string }> }>;
    };
    expect(aws.CloudWatchMetrics[0]?.Namespace).toBe("Flagstage");
    expect(aws.CloudWatchMetrics[0]?.Metrics[0]?.Name).toBe("FailedImports");
  });

  it("drops the metric when the logger is silent", () => {
    const output = capture();
    const log = createLogger({ LOG_LEVEL: "silent" }, "web", output.destination);
    emitFailure(log, "chat", {}, "chat turn failed");
    expect(output.lines()).toEqual([]);
  });

  it("matches the metric names the stack alarms on", () => {
    const template = readFileSync(
      fileURLToPath(new URL("../../../infra/cloudformation/template.yaml", import.meta.url)),
      "utf8"
    );
    for (const name of Object.values(FAILURE_METRICS)) {
      expect(template).toContain(`MetricName: ${name}`);
    }
    expect(template).toContain("Namespace: Flagstage");
    expect(template.match(/TreatMissingData: notBreaching/g)).toHaveLength(5);
  });
});
