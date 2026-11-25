import type { BlobStore } from "@flagstage/storage";

import type { CapturedFile, ImportResult, SkippedPage } from "./types";

const TEXT = new TextDecoder();

export type CrawlProgress = {
  version: 1;
  origin: string;
  pages: string[];
  assets: string[];
  skipped: SkippedPage[];
  missingAssets: string[];
  cssBackgrounds: string[];
};

export function normalizeCapturePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+/, "");
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function progressKey(prefix: string): string {
  return `${normalizeCapturePrefix(prefix)}progress.json`;
}

export function captureFileKey(prefix: string, path: string): string {
  return `${normalizeCapturePrefix(prefix)}files/${path}`;
}

export function emptyProgress(origin: string): CrawlProgress {
  return {
    version: 1,
    origin,
    pages: [],
    assets: [],
    skipped: [],
    missingAssets: [],
    cssBackgrounds: []
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function skippedList(value: unknown): SkippedPage[] {
  if (!Array.isArray(value)) return [];
  const skipped: SkippedPage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const path = (item as { path?: unknown }).path;
    const reason = (item as { reason?: unknown }).reason;
    if (typeof path === "string" && path && typeof reason === "string") {
      skipped.push({ path, reason });
    }
  }
  return skipped;
}

export async function loadProgress(
  store: BlobStore,
  prefix: string,
  origin: string
): Promise<CrawlProgress> {
  const object = await store.get(progressKey(prefix));
  if (!object) return emptyProgress(origin);
  try {
    const parsed = JSON.parse(TEXT.decode(object.body)) as Partial<CrawlProgress>;
    if (parsed.version !== 1 || parsed.origin !== origin) return emptyProgress(origin);
    return {
      version: 1,
      origin,
      pages: stringList(parsed.pages),
      assets: stringList(parsed.assets),
      skipped: skippedList(parsed.skipped),
      missingAssets: stringList(parsed.missingAssets),
      cssBackgrounds: stringList(parsed.cssBackgrounds)
    };
  } catch {
    return emptyProgress(origin);
  }
}

export async function saveProgress(
  store: BlobStore,
  prefix: string,
  progress: CrawlProgress
): Promise<void> {
  await store.put(
    progressKey(prefix),
    new TextEncoder().encode(JSON.stringify(progress)),
    "application/json"
  );
}

/** Read streamed page and asset bytes back onto the result for extraction and storage. */
export async function hydrateCaptured(
  store: BlobStore,
  result: ImportResult
): Promise<ImportResult> {
  if (!result.capturePrefix) return result;
  const prefix = result.capturePrefix;
  const load = async (file: CapturedFile): Promise<CapturedFile> => {
    if (file.body.byteLength > 0) return file;
    const stored = await store.get(captureFileKey(prefix, file.path));
    if (!stored) throw new Error(`Imported file is missing from storage (${file.path}).`);
    return {
      path: file.path,
      body: stored.body,
      contentType: stored.contentType || file.contentType
    };
  };
  return {
    ...result,
    pages: await mapLimited(result.pages, load),
    assets: await mapLimited(result.assets, load)
  };
}

export async function deleteCapture(store: BlobStore, prefix: string | undefined): Promise<void> {
  if (!prefix) return;
  let listed: Array<{ key: string; size: number }> = [];
  try {
    listed = await store.list(normalizeCapturePrefix(prefix));
  } catch {
    return;
  }
  for (const item of listed) {
    try {
      await store.delete(item.key);
    } catch {
      // The snapshot is already stored. A leftover capture object can be removed later.
    }
  }
}

async function mapLimited<T, U>(items: readonly T[], fn: (item: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  const workers = Math.min(8, items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        const item = items[index];
        if (item === undefined) continue;
        out[index] = await fn(item);
      }
    })
  );
  return out;
}
