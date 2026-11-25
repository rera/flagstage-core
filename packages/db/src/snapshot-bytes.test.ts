import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { account, site, snapshot, type Database } from "@flagstage/db";
import * as schema from "@flagstage/db";

/** First byte count that does not fit in a signed 32-bit int. */
const OVER_INT4 = 2_147_483_648;

async function database() {
  const client = new PGlite();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../drizzle");
  for (const file of [
    "0000_init.sql",
    "0003_builder.sql",
    "0004_schedule.sql",
    "0007_snapshot_bytes.sql"
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

describe("snapshot byte size", () => {
  it("stores a size above 2^31 and reads it back as a number", async () => {
    const { db, client } = await database();
    const column = await client.query<{ data_type: string }>(
      `select data_type from information_schema.columns
       where table_name = 'snapshot' and column_name = 'bytes'`
    );
    expect(column.rows[0]?.data_type).toBe("bigint");

    const accountId = randomUUID();
    const siteId = randomUUID();
    const snapshotId = randomUUID();
    await db.insert(account).values({ id: accountId, name: "Team", slug: "team" });
    await db.insert(site).values({
      id: siteId,
      accountId,
      name: "Docs",
      slug: "docs",
      status: "preview"
    });
    await db.insert(snapshot).values({
      id: snapshotId,
      siteId,
      kind: "import",
      storagePrefix: `snapshots/${siteId}/${snapshotId}/`,
      bytes: OVER_INT4
    });

    const rows = await db.select().from(snapshot).where(eq(snapshot.id, snapshotId));
    expect(rows[0]?.bytes).toBe(OVER_INT4);
    expect(typeof rows[0]?.bytes).toBe("number");

    const raw = await db.execute<{ bytes: string | number }>(
      sql`select bytes from snapshot where id = ${snapshotId}`
    );
    expect(Number(raw.rows[0]?.bytes)).toBe(OVER_INT4);
    await client.close();
  });
});
