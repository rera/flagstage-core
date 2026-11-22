import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { PublishChecks } from "@flagstage/sitebuild";
import type { Database } from "@flagstage/db";
import { importRun, message, publishEvent, site, thread } from "@flagstage/db";

export async function swapLive(
  db: Database,
  siteId: string,
  expected: string | null,
  nextId: string
): Promise<boolean> {
  const updated = await db
    .update(site)
    .set({ currentSnapshotId: nextId, status: "live" })
    .where(
      and(
        eq(site.id, siteId),
        expected ? eq(site.currentSnapshotId, expected) : isNull(site.currentSnapshotId)
      )
    )
    .returning({ id: site.id });
  return updated.length > 0;
}

export async function recordPublish(input: {
  db: Database;
  siteId: string;
  fromSnapshotId: string | null;
  toSnapshotId: string;
  actorUserId: string;
  kind: "publish" | "rollback";
}) {
  await input.db.insert(publishEvent).values({
    id: randomUUID(),
    siteId: input.siteId,
    fromSnapshotId: input.fromSnapshotId,
    toSnapshotId: input.toSnapshotId,
    actorUserId: input.actorUserId,
    kind: input.kind
  });
}

export function checkLines(checks: PublishChecks): string[] {
  const lines: string[] = [];
  for (const item of checks.drift) {
    const snippet = item.snippet.replace(/\s*\n\s*/g, " | ");
    lines.push(`${item.page}: ${item.block} drifted. ${snippet}`);
  }
  for (const item of checks.missing) {
    lines.push(`${item.page}: ${item.detail}`);
  }
  return lines;
}

/**
 * Keep the latest publish check on the import report, and leave a chat line
 * when something drifted or went missing. A clean publish clears the report.
 */
export async function notePublishChecks(
  db: Database,
  siteId: string,
  checks: PublishChecks
): Promise<void> {
  const lines = checkLines(checks);
  const runs = await db.select().from(importRun).where(eq(importRun.siteId, siteId));
  const latest = runs
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .at(-1);
  if (latest) {
    const report = asReport(latest.fidelityReport);
    if (lines.length === 0) delete report.publishChecks;
    else {
      report.publishChecks = [
        ...checks.drift.map((item) => ({
          page: item.page,
          kind: "drift",
          detail: `${item.block} drifted. ${item.snippet.replace(/\s*\n\s*/g, " | ")}`
        })),
        ...checks.missing.map((item) => ({
          page: item.page,
          kind: item.kind,
          detail: item.detail
        }))
      ];
    }
    await db
      .update(importRun)
      .set({ fidelityReport: report, updatedAt: new Date() })
      .where(eq(importRun.id, latest.id));
  }
  if (lines.length === 0) return;
  const threads = await db.select().from(thread).where(eq(thread.siteId, siteId)).limit(1);
  const existing = threads[0];
  if (!existing) return;
  const head = checks.blocked ? "Go live is blocked." : "Published with a warning.";
  await db.insert(message).values({
    id: randomUUID(),
    threadId: existing.id,
    author: "system",
    body: `${head}\n${lines.join("\n")}`
  });
}

function asReport(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export function writeHostMap(hostMapPath: string, host: string, prefix: string) {
  let current: Record<string, string> = {};
  try {
    current = JSON.parse(readFileSync(hostMapPath, "utf8")) as Record<string, string>;
  } catch {
    current = {};
  }
  current[host] = prefix;
  mkdirSync(dirname(hostMapPath), { recursive: true });
  writeFileSync(hostMapPath, JSON.stringify(current));
}

/**
 * Point the live site at an existing snapshot. Does not rebuild or upload.
 * The snapshot's `out/` (or the legacy root) is already stored.
 */
export async function rollbackTo(input: {
  db: Database;
  siteId: string;
  toSnapshotId: string;
  actorUserId: string;
  host?: string;
  hostMapPath?: string;
  prefix?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rows = await input.db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const expected = rows[0]?.currentSnapshotId ?? null;
  if (!expected || expected === input.toSnapshotId) {
    return { ok: false, reason: "That snapshot is already live." };
  }
  const swapped = await swapLive(input.db, input.siteId, expected, input.toSnapshotId);
  if (!swapped) return { ok: false, reason: "The live site changed. Refresh and try once more." };
  await recordPublish({
    db: input.db,
    siteId: input.siteId,
    fromSnapshotId: expected,
    toSnapshotId: input.toSnapshotId,
    actorUserId: input.actorUserId,
    kind: "rollback"
  });
  if (input.host && input.hostMapPath && input.prefix) {
    writeHostMap(input.hostMapPath, input.host, input.prefix);
  }
  return { ok: true };
}
