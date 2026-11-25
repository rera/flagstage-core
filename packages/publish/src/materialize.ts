import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildSite,
  diffManifests,
  reviewPublish,
  type BuildDiff,
  type BuildManifest,
  type PublishChecks
} from "@flagstage/sitebuild";
import {
  contentTypeForKey,
  manifestKey,
  outputPrefix,
  sourcePrefix,
  type BlobStore
} from "@flagstage/storage";

const text = new TextDecoder();

/** How many snapshot objects a publish reads from storage at once. */
export const SNAPSHOT_DOWNLOAD_CONCURRENCY = 8;

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
  /**
   * `import` blocks the caller when the build drops imported content.
   * `later` reports drift and large losses and still uploads.
   * Omit it for a preview build.
   */
  review?: "import" | "later";
}): Promise<{ manifest: BuildManifest; diff: BuildDiff; checks: PublishChecks | null }> {
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
    let checks: PublishChecks | null = null;
    if (input.review) {
      const previousDir =
        input.review === "later" && previousOutput
          ? await downloadPreviousHtml(input.store, previousOutput, result.diff, root)
          : undefined;
      checks = reviewPublish({
        sourceDir,
        outputDir,
        previousDir,
        diff: result.diff,
        mode: input.review
      });
    }
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
    return { manifest: result.manifest, diff: result.diff, checks };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Run the publish checks against trees already stored for a snapshot.
 * Scheduled go-live does not build again, so it reviews the stored files.
 */
export async function reviewStoredPublish(input: {
  store: BlobStore;
  storagePrefix: string;
  previousStoragePrefix?: string | null;
  mode: "import" | "later";
}): Promise<PublishChecks> {
  const storagePrefix = input.storagePrefix.endsWith("/")
    ? input.storagePrefix
    : `${input.storagePrefix}/`;
  const root = mkdtempSync(join(tmpdir(), "flagstage-review-"));
  const sourceDir = join(root, "src");
  const outputDir = join(root, "out");
  try {
    mkdirSync(sourceDir, { recursive: true });
    await download(input.store, sourcePrefix(storagePrefix), sourceDir);
    const current = await readManifest(input.store, storagePrefix);
    const previousManifest = input.previousStoragePrefix
      ? await readManifest(input.store, input.previousStoragePrefix)
      : null;
    const diff = previousManifest && current ? diffManifests(previousManifest, current) : undefined;
    if (input.mode === "later" && diff) {
      mkdirSync(outputDir, { recursive: true });
      const dest = outputPrefix(storagePrefix);
      for (const key of diff.changed.filter(isHtmlKey)) {
        const object = await input.store.get(dest + key);
        if (!object) continue;
        const abs = join(outputDir, key);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, object.body);
      }
    } else {
      await download(input.store, outputPrefix(storagePrefix), outputDir);
    }
    const previousDir =
      input.mode === "later" && input.previousStoragePrefix && diff
        ? await downloadPreviousHtml(
            input.store,
            outputPrefix(input.previousStoragePrefix),
            diff,
            root
          )
        : undefined;
    return reviewPublish({
      sourceDir,
      outputDir,
      previousDir,
      diff,
      mode: input.mode
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function downloadPreviousHtml(
  store: BlobStore,
  previousOutput: string,
  diff: BuildDiff,
  root: string
): Promise<string> {
  const dir = join(root, "prev");
  mkdirSync(dir, { recursive: true });
  const keys = [...diff.changed, ...diff.removed].filter(isHtmlKey);
  await mapLimit(keys, SNAPSHOT_DOWNLOAD_CONCURRENCY, async (key) => {
    const object = await store.get(previousOutput + key);
    if (!object) return;
    const abs = join(dir, key);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, object.body);
  });
  return dir;
}

function isHtmlKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm");
}

async function download(store: BlobStore, prefix: string, dir: string): Promise<void> {
  const files = (await store.list(prefix)).flatMap((item) => {
    const relative = item.key.slice(prefix.length);
    return isSafeRelative(relative) ? [{ key: item.key, relative }] : [];
  });
  await mapLimit(files, SNAPSHOT_DOWNLOAD_CONCURRENCY, async (file) => {
    const object = await store.get(file.key);
    if (!object) return;
    const abs = join(dir, file.relative);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, object.body);
  });
}

async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0 || limit < 1) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      await run(item);
    }
  });
  await Promise.all(workers);
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
