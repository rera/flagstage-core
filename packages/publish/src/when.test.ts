import { describe, expect, it } from "vitest";

import { confirmSchedule, parseSchedulePhrase, zonedTimeToUtc } from "./when";

describe("site time zones", () => {
  it("converts a winter wall time to UTC", () => {
    const result = zonedTimeToUtc(
      { y: 2026, m: 1, d: 15, h: 9, min: 0 },
      "America/New_York"
    );
    expect(result.adjusted).toBe(false);
    expect(result.date.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("moves a spring-forward gap forward one hour", () => {
    const result = zonedTimeToUtc(
      { y: 2026, m: 3, d: 8, h: 2, min: 30 },
      "America/New_York"
    );
    expect(result.adjusted).toBe(true);
    const shown = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit"
    }).format(result.date);
    expect(shown).toBe("03:30");
  });

  it("uses the first occurrence of a fall-back hour", () => {
    const result = zonedTimeToUtc(
      { y: 2026, m: 11, d: 1, h: 1, min: 30 },
      "America/New_York"
    );
    expect(result.adjusted).toBe(false);
    expect(result.date.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("reads publish this Friday at 9am", () => {
    const now = new Date("2026-03-11T15:00:00.000Z");
    const intent = parseSchedulePhrase(
      "publish this Friday at 9am",
      "America/New_York",
      now
    );
    expect(intent?.action).toBe("publish");
    expect(intent?.at.toISOString()).toBe("2026-03-13T13:00:00.000Z");
    expect(confirmSchedule(intent!, "America/New_York")).toContain("9:00 AM");
  });

  it("reads a take-down date", () => {
    const now = new Date("2026-03-11T15:00:00.000Z");
    const intent = parseSchedulePhrase(
      "take the holiday banner down on Jan 2",
      "America/New_York",
      now
    );
    expect(intent?.action).toBe("revert");
    expect(intent?.at.toISOString()).toBe("2027-01-02T05:00:00.000Z");
  });
});
