import { Writable } from "node:stream";

import pino from "pino";
import { describe, expect, it } from "vitest";

import { correlationMixin, runWithCorrelation } from "./correlation";

describe("correlation", () => {
  it("adds the id to each log line inside a turn", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      }
    });
    const log = pino({ mixin: correlationMixin }, stream);
    log.info("outside");
    await runWithCorrelation("11111111-1111-1111-1111-111111111111", async () => {
      log.info("inside");
    });
    const outside = JSON.parse(lines[0] ?? "{}") as { correlationId?: string };
    const inside = JSON.parse(lines[1] ?? "{}") as { correlationId?: string };
    expect(outside.correlationId).toBeUndefined();
    expect(inside.correlationId).toBe("11111111-1111-1111-1111-111111111111");
  });
});
