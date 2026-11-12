import { loadConfig } from "@flagstage/config";
import { getDb } from "@flagstage/db";
import { runImport } from "@flagstage/importer";
import { createBlobStore } from "@flagstage/storage";

const siteId = process.env.IMPORT_SITE_ID ?? "";
const runId = process.env.IMPORT_RUN_ID ?? "";
const sourceUrl = process.env.SOURCE_URL ?? "";
if (!siteId || !runId || !sourceUrl) {
  throw new Error("IMPORT_SITE_ID, IMPORT_RUN_ID, and SOURCE_URL are required.");
}

const config = loadConfig();
await runImport({
  db: getDb(config.DATABASE_URL),
  store: createBlobStore(config),
  siteId,
  importRunId: runId,
  sourceUrl,
  appOrigin: config.APP_URL,
  caps: {
    maxPages: config.IMPORT_MAX_PAGES,
    maxDepth: config.IMPORT_MAX_DEPTH,
    maxAssets: config.IMPORT_MAX_ASSETS
  }
});
