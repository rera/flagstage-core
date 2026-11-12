import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import type { Database } from "./client";
import * as fullSchema from "./index";
import { site, snapshot } from "./schema";
import { DEMO_SITE, seedDemo } from "./seed";

async function applyMigrations(client: PGlite) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../drizzle");
  for (const file of ["0000_init.sql", "0001_auth_plugins.sql"]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
}

describe("demo seed", () => {
  it("publishes one example site and does not replace it on the next boot", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    const first = await seedDemo(db, { passwordHash: "hash" });
    expect(first?.siteId).toBe(DEMO_SITE.siteId);
    expect(first?.html).toContain("</body>");
    const rows = await db.select().from(site).where(eq(site.id, DEMO_SITE.siteId));
    expect(rows[0]?.status).toBe("live");
    expect(rows[0]?.currentSnapshotId).toBe(DEMO_SITE.snapshotId);
    expect(rows[0]?.slug).toBe("demo");
    await db.insert(snapshot).values({
      id: "snap-later",
      siteId: DEMO_SITE.siteId,
      kind: "edit",
      storagePrefix: "snapshots/site-demo/snap-later/",
      fileCount: 1,
      bytes: 1
    });
    await db
      .update(site)
      .set({ currentSnapshotId: "snap-later", status: "live" })
      .where(eq(site.id, DEMO_SITE.siteId));
    await seedDemo(db, { passwordHash: "hash" });
    const again = await db.select().from(site).where(eq(site.id, DEMO_SITE.siteId));
    expect(again).toHaveLength(1);
    expect(again[0]?.currentSnapshotId).toBe("snap-later");
    await client.close();
  });
});
