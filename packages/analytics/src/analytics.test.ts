import { describe, expect, it } from "vitest";

import {
  expiredEventIds,
  injectAnalytics,
  rollupVisits,
  pageviewsByDay,
  topPages,
  visitorHash,
  visitsInRange
} from "./analytics";

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

  it("keeps 7, 30, and 90 day windows and ranks pages", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    const daily = [
      { day: "2026-03-10", path: "/", pageviews: 2, visitors: 1 },
      { day: "2026-03-04", path: "/hours", pageviews: 4, visitors: 3 },
      { day: "2025-12-01", path: "/old", pageviews: 9, visitors: 9 }
    ];
    const recent = [
      {
        siteId: "site",
        path: "/",
        referrer: null,
        visitorHash: "c",
        createdAt: new Date("2026-03-10T08:00:00Z")
      }
    ];
    const week = visitsInRange(daily, recent, now, 7);
    expect(week.map((row) => row.path).sort()).toEqual(["/", "/hours"]);
    expect(week.find((row) => row.path === "/")?.pageviews).toBe(2);
    const quarter = visitsInRange(daily, [], now, 90);
    expect(quarter).toHaveLength(2);
    expect(topPages(week)).toEqual([
      { path: "/hours", pageviews: 4 },
      { path: "/", pageviews: 2 }
    ]);
    const bars = pageviewsByDay(daily, recent, now, 7);
    expect(bars).toHaveLength(7);
    expect(bars[0]).toEqual({ day: "2026-03-04", pageviews: 4 });
    expect(bars.at(-1)).toEqual({ day: "2026-03-10", pageviews: 2 });
    expect(bars.filter((bar) => bar.pageviews === 0)).toHaveLength(5);
    expect(pageviewsByDay(daily, recent, now, 7).at(-1)?.pageviews).toBe(2);
  });
});
