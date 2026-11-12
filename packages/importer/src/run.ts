import { eq, sql } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { importRun, site } from "@flagstage/db";
import type { BlobStore } from "@flagstage/storage";

import { crawlSite } from "./crawl";
import { storeCrawl } from "./persist";
import type { ImportCaps, PageFetch } from "./types";

async function defaultFetch(url: string) {
  const response = await fetch(url, { redirect: "follow" });
  return {
    status: response.status,
    body: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? ""
  };
}

async function notify(db: Database, siteId: string) {
  try {
    await db.execute(sql`select pg_notify('flagstage_chat', ${siteId})`);
  } catch {
    // The site page also polls.
  }
}

export async function runImport(input: {
  db: Database;
  store: BlobStore;
  siteId: string;
  importRunId: string;
  sourceUrl: string;
  appOrigin: string;
  caps: ImportCaps;
  fetchPage?: PageFetch;
}): Promise<{ snapshotId?: string }> {
  const now = new Date();
  await input.db
    .update(importRun)
    .set({ status: "running", updatedAt: now })
    .where(eq(importRun.id, input.importRunId));
  try {
    const crawl = await crawlSite({
      fetchPage: input.fetchPage ?? defaultFetch,
      sourceUrl: input.sourceUrl,
      appOrigin: input.appOrigin,
      siteId: input.siteId,
      caps: input.caps,
      onProgress: async (progress) => {
        await input.db
          .update(importRun)
          .set({ stats: progress, updatedAt: new Date() })
          .where(eq(importRun.id, input.importRunId));
        await notify(input.db, input.siteId);
      }
    });
    const stored = await storeCrawl({
      db: input.db,
      store: input.store,
      siteId: input.siteId,
      importRunId: input.importRunId,
      crawl
    });
    await notify(input.db, input.siteId);
    return { snapshotId: stored.snapshotId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await input.db
      .update(importRun)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(importRun.id, input.importRunId));
    await input.db.update(site).set({ status: "failed" }).where(eq(site.id, input.siteId));
    await notify(input.db, input.siteId);
    return {};
  }
}
