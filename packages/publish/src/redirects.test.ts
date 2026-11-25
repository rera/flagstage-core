import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import {
  account,
  message,
  site,
  siteDomain,
  siteRedirect,
  siteSchedule,
  snapshot,
  type Database
} from "@flagstage/db";
import * as schema from "@flagstage/db";

import { publishScheduled } from "./schedule";
import {
  KVS_LIMITS,
  canonicalFromPath,
  memoryRedirectStore,
  planRedirectKeys,
  publishRedirects,
  redirectKey
} from "./redirects";

async function database() {
  const client = new PGlite();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of [
    "0000_init.sql",
    "0001_auth_plugins.sql",
    "0002_email_password.sql",
    "0003_builder.sql",
    "0004_schedule.sql",
    "0005_importer_settings.sql",
    "0006_edit_settings.sql",
    "0007_snapshot_bytes.sql"
  ]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
  return drizzle(client, { schema }) as unknown as Database;
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
    timeZone: "UTC"
  });
  await db.insert(snapshot).values([
    { id: liveId, siteId, kind: "publish", storagePrefix: `snapshots/${siteId}/${liveId}/` },
    { id: draftId, siteId, kind: "edit", storagePrefix: `snapshots/${siteId}/${draftId}/` }
  ]);
  await db.update(site).set({ currentSnapshotId: liveId }).where(eq(site.id, siteId));
  return { siteId, liveId, draftId };
}

describe("redirect keys", () => {
  it("keeps a query string on the key and sorts its parameters", () => {
    expect(canonicalFromPath("/?p=7")).toBe("/?p=7");
    expect(canonicalFromPath("/archive/?b=1&a=2")).toBe("/archive/?a=2&b=1");
    expect(redirectKey("WWW.Example.com", "/feed/")).toBe("www.example.com/feed/");
    expect(KVS_LIMITS).toEqual({
      maxKeyBytes: 512,
      maxValueBytes: 1024,
      maxStoreBytes: 5 * 1024 * 1024
    });
  });

  it("rejects a key, a value, or a map that exceeds the store limits", () => {
    expect(() =>
      planRedirectKeys(["docs.localhost"], [{ fromPath: `/${"a".repeat(600)}`, toPath: "/" }])
    ).toThrow(/512 bytes/);
    expect(() =>
      planRedirectKeys(["docs.localhost"], [{ fromPath: "/old", toPath: `/${"b".repeat(1100)}` }])
    ).toThrow(/1 KB/);
    expect(() =>
      planRedirectKeys(["docs.localhost"], [{ fromPath: "/old", toPath: "/next" }], {
        ...KVS_LIMITS,
        maxStoreBytes: 10
      })
    ).toThrow(/5 MB|bytes/);
  });
});

describe("publish redirects", () => {
  it("writes a path and a query-string redirect for each hostname and deletes stale keys", async () => {
    const db = await database();
    const { siteId, draftId } = await fixture(db);
    await db.insert(siteDomain).values({
      id: randomUUID(),
      siteId,
      hostname: "www.customer.example"
    });
    await db.insert(siteRedirect).values([
      {
        id: randomUUID(),
        siteId,
        fromPath: "/old",
        toPath: "/next",
        code: 301,
        source: "test"
      },
      {
        id: randomUUID(),
        siteId,
        fromPath: "/?p=7",
        toPath: "/hello",
        code: 301,
        source: "test"
      }
    ]);
    const store = memoryRedirectStore({
      "docs.localhost": "snapshots/site/snap/",
      "docs.localhost/gone": "/",
      "other.example/keep": "/stay"
    });
    const id = randomUUID();
    const now = new Date("2026-06-01T15:00:00.000Z");
    await db.insert(siteSchedule).values({
      id,
      siteId,
      snapshotId: draftId,
      publishAt: new Date("2026-06-01T14:00:00.000Z"),
      status: "scheduled"
    });
    expect(
      await publishScheduled(db, id, now, undefined, {
        store,
        hostFor: (slug) => `${slug}.localhost`
      })
    ).toBe("published");
    const live = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
    expect(live[0]?.currentSnapshotId).toBe(draftId);
    expect(store.entries.get("docs.localhost/old")).toBe("/next");
    expect(store.entries.get("docs.localhost/?p=7")).toBe("/hello");
    expect(store.entries.get("www.customer.example/old")).toBe("/next");
    expect(store.entries.get("www.customer.example/?p=7")).toBe("/hello");
    expect(store.entries.has("docs.localhost/gone")).toBe(false);
    expect(store.entries.get("other.example/keep")).toBe("/stay");
    expect(store.entries.get("docs.localhost")).toBe("snapshots/site/snap/");
  });

  it("does not go live or write keys when the site does not fit", async () => {
    const db = await database();
    const { siteId, liveId, draftId } = await fixture(db);
    await db.insert(siteRedirect).values({
      id: randomUUID(),
      siteId,
      fromPath: `/${"a".repeat(600)}`,
      toPath: "/",
      code: 301,
      source: "test"
    });
    const store = memoryRedirectStore({ "docs.localhost/old": "/" });
    const id = randomUUID();
    await db.insert(siteSchedule).values({
      id,
      siteId,
      snapshotId: draftId,
      publishAt: new Date("2026-06-01T14:00:00.000Z"),
      status: "scheduled"
    });
    expect(
      await publishScheduled(db, id, new Date("2026-06-01T15:00:00.000Z"), undefined, {
        store,
        hostFor: (slug) => `${slug}.localhost`
      })
    ).toBe("skipped");
    const live = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
    expect(live[0]?.currentSnapshotId).toBe(liveId);
    expect(store.entries.get("docs.localhost/old")).toBe("/");
    expect(store.entries.size).toBe(1);
    const notes = await db.select().from(message);
    expect(notes.some((row) => row.body.includes("512 bytes"))).toBe(true);
  });

  it("leaves the store unchanged when the projected size exceeds the limit", async () => {
    const db = await database();
    const { siteId } = await fixture(db);
    await db.insert(siteRedirect).values({
      id: randomUUID(),
      siteId,
      fromPath: "/old",
      toPath: "/next",
      code: 301,
      source: "test"
    });
    const store = memoryRedirectStore({ "other.example/keep": "/z" });
    let updates = 0;
    await expect(
      publishRedirects({
        db,
        siteId,
        host: "docs.localhost",
        store: {
          list: () => store.list(),
          size: () => store.size(),
          async update(change) {
            updates += 1;
            await store.update(change);
          }
        },
        limits: { ...KVS_LIMITS, maxStoreBytes: 20 }
      })
    ).rejects.toThrow(/Publish stopped/);
    expect(updates).toBe(0);
    expect(store.entries.get("other.example/keep")).toBe("/z");
  });
});
