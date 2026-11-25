import type { BlobStore } from "@flagstage/storage";
import { sourcePrefix } from "@flagstage/storage";
import { DRIFT_MANIFEST_PATH, SITE_SKILL_PATH } from "@flagstage/importer";

import { flagPagePaths, readImportSummary, type ImportSummary } from "./import-review";

const BASELINE_PATH = ".flagstage/baseline.json";

export async function readSnapshotImport(
  store: BlobStore,
  storagePrefix: string,
  stats: unknown,
  report: unknown,
  siteId: string
): Promise<ImportSummary> {
  const prefix = sourcePrefix(storagePrefix);
  const [drift, skill, baseline] = await Promise.all([
    readText(store, `${prefix}${DRIFT_MANIFEST_PATH}`),
    readText(store, `${prefix}${SITE_SKILL_PATH}`),
    readText(store, `${prefix}${BASELINE_PATH}`)
  ]);
  const pagesHtml = new Map<string, string | null>();
  await Promise.all(
    flagPagePaths(report).map(async (path) => {
      pagesHtml.set(path, await readText(store, `${prefix}${path}`));
    })
  );
  return readImportSummary({ stats, report, drift, skill, baseline, siteId, pagesHtml });
}

async function readText(store: BlobStore, key: string): Promise<string | null> {
  const object = await store.get(key);
  if (!object) return null;
  return new TextDecoder().decode(object.body);
}
