import { randomUUID } from "node:crypto";

import { and, eq, lte } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { changeRequest, site, siteSchedule, snapshot, thread } from "@flagstage/db";

import { armSchedule } from "./arm";
import { recordPublish, swapLive } from "./publish";
import { describeInstant } from "./when";

export type ScheduleRow = typeof siteSchedule.$inferSelect;

async function usageRow(db: Database, siteId: string, summary: string, snapshotId: string | null) {
  const threads = await db.select().from(thread).where(eq(thread.siteId, siteId)).limit(1);
  const threadId = threads[0]?.id ?? randomUUID();
  if (!threads[0]) {
    await db.insert(thread).values({
      id: threadId,
      siteId,
      title: "Schedules",
      status: "open"
    });
  }
  await db.insert(changeRequest).values({
    id: randomUUID(),
    threadId,
    siteId,
    status: "published",
    resultSnapshotId: snapshotId,
    summary,
    usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }
  });
}

async function claim(db: Database, id: string, from: string, to: string): Promise<boolean> {
  const updated = await db
    .update(siteSchedule)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(siteSchedule.id, id), eq(siteSchedule.status, from)))
    .returning({ id: siteSchedule.id });
  return updated.length > 0;
}

export async function publishScheduled(
  db: Database,
  id: string,
  now = new Date()
): Promise<"published" | "skipped" | "noop"> {
  const rows = await db.select().from(siteSchedule).where(eq(siteSchedule.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.status !== "scheduled") return "noop";
  if (row.publishAt.getTime() > now.getTime() + 5_000) return "noop";
  if (!(await claim(db, id, "scheduled", "publishing"))) return "noop";
  const snaps = await db.select().from(snapshot).where(eq(snapshot.id, row.snapshotId)).limit(1);
  const target = snaps[0];
  const sites = await db.select().from(site).where(eq(site.id, row.siteId)).limit(1);
  const current = sites[0];
  if (!target || !current) {
    await db
      .update(siteSchedule)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(eq(siteSchedule.id, id));
    return "skipped";
  }
  if (current.currentSnapshotId === target.id) {
    await db
      .update(siteSchedule)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(eq(siteSchedule.id, id));
    return "skipped";
  }
  const previous = current.currentSnapshotId;
  const swapped = await swapLive(db, current.id, previous, target.id);
  if (!swapped) {
    await db
      .update(siteSchedule)
      .set({ status: "scheduled", updatedAt: new Date() })
      .where(eq(siteSchedule.id, id));
    return "noop";
  }
  await recordPublish({
    db,
    siteId: current.id,
    fromSnapshotId: previous,
    toSnapshotId: target.id,
    actorUserId: row.actorUserId ?? "schedule",
    kind: "publish"
  });
  await usageRow(db, current.id, "Scheduled publish", target.id);
  await db
    .update(siteSchedule)
    .set({
      status: "live",
      revertToSnapshotId: previous,
      updatedAt: new Date()
    })
    .where(eq(siteSchedule.id, id));
  return "published";
}

export async function revertScheduled(
  db: Database,
  id: string,
  now = new Date()
): Promise<"reverted" | "skipped" | "noop"> {
  const rows = await db.select().from(siteSchedule).where(eq(siteSchedule.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.status !== "live" || !row.revertAt || !row.revertToSnapshotId) return "noop";
  if (row.revertAt.getTime() > now.getTime() + 5_000) return "noop";
  if (!(await claim(db, id, "live", "reverting"))) return "noop";
  const snaps = await db
    .select()
    .from(snapshot)
    .where(eq(snapshot.id, row.revertToSnapshotId))
    .limit(1);
  const target = snaps[0];
  const sites = await db.select().from(site).where(eq(site.id, row.siteId)).limit(1);
  const current = sites[0];
  if (!target || !current) {
    await db
      .update(siteSchedule)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(eq(siteSchedule.id, id));
    return "skipped";
  }
  if (current.currentSnapshotId === target.id) {
    await db
      .update(siteSchedule)
      .set({ status: "reverted", updatedAt: new Date() })
      .where(eq(siteSchedule.id, id));
    return "reverted";
  }
  const previous = current.currentSnapshotId;
  const swapped = await swapLive(db, current.id, previous, target.id);
  if (!swapped) {
    await db
      .update(siteSchedule)
      .set({ status: "live", updatedAt: new Date() })
      .where(eq(siteSchedule.id, id));
    return "noop";
  }
  await recordPublish({
    db,
    siteId: current.id,
    fromSnapshotId: previous,
    toSnapshotId: target.id,
    actorUserId: row.actorUserId ?? "schedule",
    kind: "rollback"
  });
  await usageRow(db, current.id, "Scheduled revert", target.id);
  await db
    .update(siteSchedule)
    .set({ status: "reverted", updatedAt: new Date() })
    .where(eq(siteSchedule.id, id));
  return "reverted";
}

export async function runDueSchedules(db: Database, now = new Date()): Promise<string[]> {
  const applied: string[] = [];
  const duePublish = await db
    .select({ id: siteSchedule.id })
    .from(siteSchedule)
    .where(and(eq(siteSchedule.status, "scheduled"), lte(siteSchedule.publishAt, now)));
  for (const row of duePublish) {
    const result = await publishScheduled(db, row.id, now);
    if (result === "published") applied.push(row.id);
  }
  const dueRevert = await db
    .select({ id: siteSchedule.id })
    .from(siteSchedule)
    .where(and(eq(siteSchedule.status, "live"), lte(siteSchedule.revertAt, now)));
  for (const row of dueRevert) {
    const result = await revertScheduled(db, row.id, now);
    if (result === "reverted") applied.push(row.id);
  }
  return applied;
}

export async function insertSchedule(
  db: Database,
  input: {
    siteId: string;
    snapshotId: string;
    publishAt: Date;
    revertAt: Date | null;
    actorUserId: string;
    summary: string;
    timeZone: string;
  }
) {
  const id = randomUUID();
  await db.update(site).set({ timeZone: input.timeZone }).where(eq(site.id, input.siteId));
  await db.insert(siteSchedule).values({
    id,
    siteId: input.siteId,
    snapshotId: input.snapshotId,
    publishAt: input.publishAt,
    revertAt: input.revertAt,
    actorUserId: input.actorUserId,
    summary: input.summary,
    status: "scheduled"
  });
  await armSchedule(id, input.publishAt, "publish").catch(() => undefined);
  if (input.revertAt) await armSchedule(id, input.revertAt, "revert").catch(() => undefined);
  return id;
}

export function describeSchedule(row: ScheduleRow, timeZone: string): string {
  const when = describeInstant(row.publishAt, timeZone);
  if (row.status === "scheduled") {
    const revert = row.revertAt ? `. Reverts ${describeInstant(row.revertAt, timeZone)}` : "";
    return `Goes live ${when}${revert}`;
  }
  if (row.status === "live" && row.revertAt) {
    return `Live. Reverts ${describeInstant(row.revertAt, timeZone)}`;
  }
  if (row.status === "live") return "Live";
  if (row.status === "reverted") return "Reverted";
  if (row.status === "cancelled") return "Cancelled";
  return "Skipped";
}
