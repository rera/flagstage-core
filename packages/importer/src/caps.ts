import { getImporterSettings } from "@flagstage/core";
import type { Database } from "@flagstage/db";

import type { ImportCaps } from "./types";

/**
 * Page and asset caps for one import.
 *
 * This is the only function that chooses them. `maxPages` and `maxAssets`
 * come from platform importer settings (5,000 and 20,000 when the row is
 * missing). `maxDepth` stays the value for this run. There is no environment
 * variable for the page or asset cap.
 */
export async function readImportCaps(db: Database, maxDepth: number): Promise<ImportCaps> {
  const settings = await getImporterSettings(db);
  return {
    maxPages: settings.maxPages,
    maxAssets: settings.maxAssets,
    maxDepth
  };
}
