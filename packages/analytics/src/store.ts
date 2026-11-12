import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { analyticsDaily, analyticsEvent } from "@flagstage/db";

import { expiredEventIds, rollupVisits, type DailyRow } from "./analytics";

export async function rollupStored(db: Database, now = new Date()): Promise<number> {
  const events = await db.select().from(analyticsEvent);
  const staleIds = new Set(expiredEventIds(events, now));
  const stale = events.filter((event) => staleIds.has(event.id));
  const rows = rollupVisits(
    stale.map((event) => ({
      siteId: event.siteId,
      path: event.path,
      referrer: event.referrer,
      visitorHash: event.visitorHash,
      createdAt: event.createdAt
    }))
  );
  for (const row of rows) {
    await addDaily(db, row);
  }
  if (staleIds.size > 0) {
    await db.delete(analyticsEvent).where(inArray(analyticsEvent.id, [...staleIds]));
  }
  return stale.length;
}

async function addDaily(db: Database, row: DailyRow) {
  const existing = await db
    .select()
    .from(analyticsDaily)
    .where(eq(analyticsDaily.siteId, row.siteId));
  const match = existing.find((item) => item.day === row.day && item.path === row.path);
  if (!match) {
    await db.insert(analyticsDaily).values({
      id: randomUUID(),
      siteId: row.siteId,
      day: row.day,
      path: row.path,
      pageviews: row.pageviews,
      visitors: row.visitors,
      topReferrers: row.topReferrers
    });
    return;
  }
  const referrers = new Map<string, number>();
  for (const item of (match.topReferrers as Array<{ referrer: string; count: number }>) ?? []) {
    referrers.set(item.referrer, item.count);
  }
  for (const item of row.topReferrers) {
    referrers.set(item.referrer, (referrers.get(item.referrer) ?? 0) + item.count);
  }
  await db
    .update(analyticsDaily)
    .set({
      pageviews: match.pageviews + row.pageviews,
      visitors: match.visitors + row.visitors,
      topReferrers: [...referrers.entries()].map(([referrer, count]) => ({ referrer, count }))
    })
    .where(eq(analyticsDaily.id, match.id));
}
