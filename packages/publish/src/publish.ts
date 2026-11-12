import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { publishEvent, site } from "@flagstage/db";

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
