import { eq, sql } from "drizzle-orm";

import { bedrockListingDecide } from "@flagstage/ai";
import { getImporterSettings } from "@flagstage/core";
import type { Database } from "@flagstage/db";
import { importRun, site } from "@flagstage/db";
import { importPrefix, type BlobStore } from "@flagstage/storage";

import { withImportBaseline } from "./baseline";
import { readImportCaps } from "./caps";
import { deleteCapture, hydrateCaptured } from "./capture";
import { explainUncertainBlocks } from "./explain";
import { extractSharedBlocks } from "./extract";
import { defaultFetch } from "./fetch-page";
import { scaffoldSite } from "./templates";
import { storeImport } from "./persist";
import { detectImporter, getImporter } from "./registry";
import type { ImportCaps, PageFetch } from "./types";

async function chosenSource(
  db: Database,
  importRunId: string,
  explicit: string | undefined
): Promise<string> {
  const named = explicit?.trim() ?? "";
  if (named) return named;
  const rows = await db
    .select({ options: importRun.options })
    .from(importRun)
    .where(eq(importRun.id, importRunId))
    .limit(1);
  let options: unknown = rows[0]?.options;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options) as unknown;
    } catch {
      return "";
    }
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) return "";
  const source = (options as { source?: unknown }).source;
  return typeof source === "string" ? source.trim() : "";
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
  /** Page and asset caps are read from platform settings. Depth is per run. */
  caps: Pick<ImportCaps, "maxDepth"> & Partial<ImportCaps>;
  /** Same-origin pages to import. When set, the public crawler does not discover further pages. */
  urls?: readonly string[];
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
    const caps = await readImportCaps(input.db, input.caps.maxDepth);
    const capturePrefix = importPrefix(input.importRunId);
    const requested = await chosenSource(input.db, input.importRunId, input.source);
    const sourceName = requested
      ? requested
      : (await detectImporter(input.sourceUrl, fetchPage)).id;
    if (settings.disabledImporters.includes(sourceName)) {
      throw new Error(`The ${sourceName} importer is turned off.`);
    }
    const importer = getImporter(sourceName);
    const imported = await hydrateCaptured(
      input.store,
      await importer.run({
        fetchPage,
        sourceUrl: input.sourceUrl,
        appOrigin: input.appOrigin,
        siteId: input.siteId,
        caps,
        urls: input.urls,
        store: input.store,
        capturePrefix,
        onProgress: async (progress) => {
          await input.db
            .update(importRun)
            .set({ stats: progress, updatedAt: new Date() })
            .where(eq(importRun.id, input.importRunId));
          await notify(input.db, input.siteId);
        }
      })
    );
    const scaffolded = await scaffoldSite(extractSharedBlocks(imported), {
      decide: bedrockListingDecide({
        region: input.region ?? "",
        settings
      }),
      confidenceThreshold: settings.decisionConfidenceThreshold
    });
    const result = withImportBaseline(
      await explainUncertainBlocks(scaffolded, {
        region: input.region ?? "",
        settings
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
    await deleteCapture(input.store, result.capturePrefix);
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
