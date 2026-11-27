import { describe, expect, it } from "vitest";

import { compactWhen, friendlyWhen, historyActor, monthKey } from "./time";

describe("friendlyWhen", () => {
  it("uses the site zone, so a Pacific afternoon is not an evening UTC clock", () => {
    const at = new Date("2026-11-12T22:50:00.000Z");
    const now = new Date("2026-11-12T23:56:00.000Z");
    expect(friendlyWhen(at, "America/Los_Angeles", now)).toBe("Today, 2:50 PM PT");
    expect(friendlyWhen(at, "UTC", now)).toBe("Today, 10:50 PM UTC");
  });

  it("labels the previous calendar day, not a raw 24 hour subtraction", () => {
    const at = new Date("2026-11-12T02:00:00.000Z");
    const now = new Date("2026-11-12T23:00:00.000Z");
    expect(friendlyWhen(at, "America/Los_Angeles", now)).toBe("Yesterday, 6:00 PM PT");
  });

  it("drops the zone for a narrow column", () => {
    const at = new Date("2026-11-24T18:42:00.000Z");
    expect(compactWhen(at, "America/New_York")).toBe("Nov 24, 1:42 PM");
    expect(compactWhen(at, "UTC")).toBe("Nov 24, 6:42 PM");
  });

  it("does not call a future instant today", () => {
    const now = new Date("2026-11-12T18:00:00.000Z");
    const later = new Date("2026-11-14T17:00:00.000Z");
    expect(friendlyWhen(later, "America/Los_Angeles", now)).toBe("Nov 14, 9:00 AM PT");
  });

  it("says From your old site when an import has no person", () => {
    expect(historyActor("import", null)).toBe("From your old site");
    expect(historyActor("import", { name: "  ", email: "" })).toBe("From your old site");
    expect(historyActor("import", { name: "Ada", email: "ada@example.com" })).toBe("Ada");
    expect(historyActor("import", { name: "", email: "ada@example.com" })).toBe("ada@example.com");
    expect(historyActor("publish", null)).toBe("Someone on the account");
    expect(historyActor("edit", undefined)).toBe("Someone on the account");
  });

  it("keys the month in the same zone", () => {
    expect(monthKey(new Date("2026-11-01T06:30:00.000Z"), "America/Los_Angeles")).toBe("2026-10");
    expect(monthKey(new Date("2026-11-01T06:30:00.000Z"), "UTC")).toBe("2026-11");
  });
});
