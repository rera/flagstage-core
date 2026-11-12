import { describe, expect, it } from "vitest";

import { expiredEventIds, injectAnalytics, rollupVisits, visitorHash } from "./analytics";

describe("analytics", () => {
  it("hashes a visitor with a daily salt and never returns the address", () => {
    const first = visitorHash("salt", "2026-01-01", "203.0.113.4", "Browser");
    const same = visitorHash("salt", "2026-01-01", "203.0.113.4", "Browser");
    const nextDay = visitorHash("salt", "2026-01-02", "203.0.113.4", "Browser");
    expect(first).toBe(same);
    expect(first).not.toBe(nextDay);
    expect(first).not.toContain("203.0.113.4");
  });

  it("counts pageviews and unique visitors", () => {
    const day = new Date("2026-01-01T12:00:00Z");
    const rows = rollupVisits([
      {
        siteId: "site",
        path: "/",
        referrer: "https://news.example",
        visitorHash: "a",
        createdAt: day
      },
      {
        siteId: "site",
        path: "/",
        referrer: "https://news.example",
        visitorHash: "a",
        createdAt: day
      },
      { siteId: "site", path: "/", referrer: null, visitorHash: "b", createdAt: day }
    ]);
    expect(rows).toEqual([
      {
        siteId: "site",
        day: "2026-01-01",
        path: "/",
        pageviews: 3,
        visitors: 2,
        topReferrers: [{ referrer: "https://news.example", count: 2 }]
      }
    ]);
  });

  it("adds the beacon when analytics is on and removes it on the next publish when off", () => {
    const html = "<html><body><h1>Hi</h1></body></html>";
    const live = injectAnalytics(html, "https://app.example", "site-1", true);
    expect(live).toContain('src="https://app.example/a.js"');
    expect(live).toContain('data-site="site-1"');
    const quiet = injectAnalytics(live, "https://app.example", "site-1", false);
    expect(quiet).not.toContain("/a.js");
    expect(quiet).toContain("<h1>Hi</h1>");
  });

  it("drops raw events after 48 hours", () => {
    const now = new Date("2026-01-03T00:00:01Z");
    const ids = expiredEventIds(
      [
        { id: "old", createdAt: new Date("2026-01-01T00:00:00Z") },
        { id: "new", createdAt: new Date("2026-01-02T12:00:00Z") }
      ],
      now
    );
    expect(ids).toEqual(["old"]);
  });
});
