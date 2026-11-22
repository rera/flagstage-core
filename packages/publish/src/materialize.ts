import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { buildSite, type BuildDiff, type BuildManifest } from "@flagstage/sitebuild";
import {
  contentTypeForKey,
  manifestKey,
  outputPrefix,
  sourcePrefix,
  type BlobStore
} from "@flagstage/storage";

const text = new TextDecoder();

/**
 * Copy a legacy snapshot (files at the prefix root) into `src/`.
 * A second call is a no-op once any source file exists. Legacy objects stay
 * where they are, so a hostname still pointed at the old prefix keeps working.
 */
export async function ensureSourceLayout(store: BlobStore, storagePrefix: string): Promise<void> {
  const normalized = storagePrefix.endsWith("/") ? storagePrefix : `${storagePrefix}/`;
  const source = sourcePrefix(normalized);
  const listed = await store.list(normalized);
  if (listed.some((item) => item.key.startsWith(source) && item.key.length > source.length)) return;
  for (const item of listed) {
    const relative = item.key.slice(normalized.length);
    if (!relative || relative.endsWith("/")) continue;
    if (
      relative.startsWith("src/") ||
      relative.startsWith("out/") ||
      relative.startsWith(".flagstage/")
    ) {
      continue;
    }
    await store.copy(item.key, `${source}${relative}`);
  }
}

export async function readManifest(
  store: BlobStore,
  storagePrefix: string
): Promise<BuildManifest | null> {
  const object = await store.get(manifestKey(storagePrefix));
  if (!object) return null;
  return parseManifest(object.body);
}

/**
 * Build `src/` into `out/` and upload the diff.
 * Changed keys are written. Unchanged keys are copied from the previous
 * snapshot's `out/`. Removed keys are deleted from this snapshot's `out/`
 * only, so the previous snapshot stays intact for a pointer-swap rollback.
 * A plain HTML site is a byte copy. Running this again is safe.
 */
export async function materializeOutput(input: {
  store: BlobStore;
  storagePrefix: string;
  /** Snapshot whose manifest and `out/` supply the unchanged-file copies. */
  previousStoragePrefix?: string | null;
}): Promise<{ manifest: BuildManifest; diff: BuildDiff }> {
  const storagePrefix = input.storagePrefix.endsWith("/")
    ? input.storagePrefix
    : `${input.storagePrefix}/`;
  await ensureSourceLayout(input.store, storagePrefix);
  const previous = input.previousStoragePrefix
    ? await readManifest(input.store, input.previousStoragePrefix)
    : null;
  const previousOutput =
    previous && input.previousStoragePrefix ? outputPrefix(input.previousStoragePrefix) : undefined;

  const root = mkdtempSync(join(tmpdir(), "flagstage-publish-"));
  const sourceDir = join(root, "src");
  const outputDir = join(root, "out");
  try {
    mkdirSync(sourceDir, { recursive: true });
    await download(input.store, sourcePrefix(storagePrefix), sourceDir);
    const result = buildSite({
      sourceDir,
      outputDir,
      previous: previous ?? undefined
    });
    const dest = outputPrefix(storagePrefix);
    for (const key of result.diff.changed) {
      await input.store.put(dest + key, readFileSync(join(outputDir, key)), contentTypeForKey(key));
    }
    for (const key of result.diff.unchanged) {
      const body = () => readFileSync(join(outputDir, key));
      if (!previousOutput) {
        await input.store.put(dest + key, body(), contentTypeForKey(key));
        continue;
      }
      try {
        await input.store.copy(previousOutput + key, dest + key);
      } catch {
        await input.store.put(dest + key, body(), contentTypeForKey(key));
      }
    }
    for (const key of result.diff.removed) {
      await input.store.delete(dest + key);
    }
    await input.store.put(
      manifestKey(storagePrefix),
      new TextEncoder().encode(JSON.stringify(result.manifest)),
      "application/json"
    );
    return { manifest: result.manifest, diff: result.diff };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function download(store: BlobStore, prefix: string, dir: string): Promise<void> {
  for (const item of await store.list(prefix)) {
    const relative = item.key.slice(prefix.length);
    if (!isSafeRelative(relative)) continue;
    const object = await store.get(item.key);
    if (!object) continue;
    const abs = join(dir, relative);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, object.body);
  }
}

function isSafeRelative(relative: string): boolean {
  if (!relative || relative.endsWith("/")) return false;
  return !relative.split("/").some((part) => part === "" || part === "." || part === "..");
}

function parseManifest(body: Uint8Array): BuildManifest | null {
  try {
    const parsed = JSON.parse(text.decode(body)) as { files?: unknown };
    if (
      !parsed ||
      typeof parsed.files !== "object" ||
      parsed.files === null ||
      Array.isArray(parsed.files)
    ) {
      return null;
    }
    const files: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.files)) {
      if (typeof value !== "string") return null;
      files[key] = value;
    }
    return { files };
  } catch {
    return null;
  }
}
