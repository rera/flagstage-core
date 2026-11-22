import { eq, sql } from "drizzle-orm";

import { bedrockListingDecide } from "@flagstage/ai";
import type { Database } from "@flagstage/db";
import { importRun, site } from "@flagstage/db";
import type { BlobStore } from "@flagstage/storage";

import { extractSharedBlocks } from "./extract";
import { scaffoldSite } from "./templates";
import { storeImport } from "./persist";
import { getImporter, PUBLIC_SITE_SOURCE } from "./registry";
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
  source?: string;
  fetchPage?: PageFetch;
}): Promise<{ snapshotId?: string }> {
  const now = new Date();
  await input.db
    .update(importRun)
    .set({ status: "running", updatedAt: now })
    .where(eq(importRun.id, input.importRunId));
  try {
    const importer = getImporter(input.source?.trim() || PUBLIC_SITE_SOURCE);
    const imported = await importer.run({
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
    const result = await scaffoldSite(extractSharedBlocks(imported), {
      decide: bedrockListingDecide()
    });
    const stored = await storeImport({
      db: input.db,
      store: input.store,
      siteId: input.siteId,
      importRunId: input.importRunId,
      result
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
