import { eq, sql } from "drizzle-orm";

import { bedrockListingDecide } from "@flagstage/ai";
import { getImporterSettings } from "@flagstage/core";
import type { Database } from "@flagstage/db";
import { importRun, site } from "@flagstage/db";
import type { BlobStore } from "@flagstage/storage";

import { withImportBaseline } from "./baseline";
import { extractSharedBlocks } from "./extract";
import { defaultFetch } from "./fetch-page";
import { scaffoldSite } from "./templates";
import { storeImport } from "./persist";
import { detectImporter, getImporter } from "./registry";
import type { ImportCaps, PageFetch } from "./types";

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
  /** Page and asset caps are read from platform settings. Depth is per run. */
  caps: Pick<ImportCaps, "maxDepth"> & Partial<ImportCaps>;
  source?: string;
  fetchPage?: PageFetch;
  /** Bedrock region for the decision model. The model id is not read from the environment. */
  region?: string;
}): Promise<{ snapshotId?: string }> {
  const now = new Date();
  await input.db
    .update(importRun)
    .set({ status: "running", updatedAt: now })
    .where(eq(importRun.id, input.importRunId));
  try {
    const settings = await getImporterSettings(input.db);
    const fetchPage = input.fetchPage ?? defaultFetch;
    const requested = input.source?.trim();
    const sourceName = requested
      ? requested
      : (await detectImporter(input.sourceUrl, fetchPage)).id;
    if (settings.disabledImporters.includes(sourceName)) {
      throw new Error(`The ${sourceName} importer is turned off.`);
    }
    const importer = getImporter(sourceName);
    const imported = await importer.run({
      fetchPage,
      sourceUrl: input.sourceUrl,
      appOrigin: input.appOrigin,
      siteId: input.siteId,
      caps: {
        maxPages: settings.maxPages,
        maxAssets: settings.maxAssets,
        maxDepth: input.caps.maxDepth
      },
      onProgress: async (progress) => {
        await input.db
          .update(importRun)
          .set({ stats: progress, updatedAt: new Date() })
          .where(eq(importRun.id, input.importRunId));
        await notify(input.db, input.siteId);
      }
    });
    const result = withImportBaseline(
      await scaffoldSite(extractSharedBlocks(imported), {
        decide: bedrockListingDecide({
          region: input.region ?? "",
          settings
        }),
        confidenceThreshold: settings.decisionConfidenceThreshold
      }),
      imported.pages
    );
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
