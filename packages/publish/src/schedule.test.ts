import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { account, site, siteSchedule, snapshot, type Database } from "@flagstage/db";
import * as schema from "@flagstage/db";

import { publishScheduled, revertScheduled } from "./schedule";

async function database() {
  const client = new PGlite();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of [
    "0000_init.sql",
    "0001_auth_plugins.sql",
    "0002_email_password.sql",
    "0003_builder.sql",
    "0004_schedule.sql"
  ]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
  const db = drizzle(client, { schema }) as unknown as Database;
  return { db, client };
}

async function fixture(db: Database) {
  const accountId = randomUUID();
  const siteId = randomUUID();
  const liveId = randomUUID();
  const draftId = randomUUID();
  await db.insert(account).values({ id: accountId, name: "Team", slug: "team" });
  await db.insert(site).values({
    id: siteId,
    accountId,
    name: "Docs",
    slug: "docs",
    status: "live",
    timeZone: "America/New_York"
  });
  await db.insert(snapshot).values([
    { id: liveId, siteId, kind: "publish", storagePrefix: `snapshots/${siteId}/${liveId}/` },
    { id: draftId, siteId, kind: "edit", storagePrefix: `snapshots/${siteId}/${draftId}/` }
  ]);
  await db.update(site).set({ currentSnapshotId: liveId }).where(eq(site.id, siteId));
  return { siteId, liveId, draftId };
}

describe("scheduled publish", () => {
  it("publishes once, then reverts to the snapshot that was live", async () => {
    const { db } = await database();
    const { siteId, liveId, draftId } = await fixture(db);
    const id = randomUUID();
    const now = new Date("2026-06-01T15:00:00.000Z");
    await db.insert(siteSchedule).values({
      id,
      siteId,
      snapshotId: draftId,
      publishAt: new Date("2026-06-01T14:00:00.000Z"),
      revertAt: new Date("2026-06-01T14:30:00.000Z"),
      actorUserId: "user-1",
      summary: "Promotion",
      status: "scheduled"
    });
    expect(await publishScheduled(db, id, now)).toBe("published");
    expect(await publishScheduled(db, id, now)).toBe("noop");
    const after = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
    expect(after[0]?.currentSnapshotId).toBe(draftId);
    const saved = await db.select().from(siteSchedule).where(eq(siteSchedule.id, id)).limit(1);
    expect(saved[0]?.revertToSnapshotId).toBe(liveId);
    expect(await revertScheduled(db, id, now)).toBe("reverted");
    expect(await revertScheduled(db, id, now)).toBe("noop");
    const reverted = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
    expect(reverted[0]?.currentSnapshotId).toBe(liveId);
  });

  it("skips when the snapshot is already live or missing", async () => {
    const { db, client } = await database();
    const { siteId, liveId } = await fixture(db);
    const already = randomUUID();
    await db.insert(siteSchedule).values({
      id: already,
      siteId,
      snapshotId: liveId,
      publishAt: new Date("2026-06-01T14:00:00.000Z"),
      status: "scheduled"
    });
    expect(await publishScheduled(db, already, new Date("2026-06-01T15:00:00.000Z"))).toBe(
      "skipped"
    );
    const gone = randomUUID();
    await db.insert(siteSchedule).values({
      id: gone,
      siteId,
      snapshotId: liveId,
      publishAt: new Date("2026-06-01T14:00:00.000Z"),
      status: "scheduled"
    });
    await client.exec(`
      alter table site drop constraint if exists site_current_snapshot_fk;
      alter table site_schedule drop constraint if exists site_schedule_snapshot_id_fkey;
      delete from snapshot where id = '${liveId}';
    `);
    expect(await publishScheduled(db, gone, new Date("2026-06-01T15:00:00.000Z"))).toBe("skipped");
  });
});
