// Ported from rera/flagstage packages/sites/src/domains/hostname.ts snapshotObjectPrefix @ 27a19bd0c040d40ce2356d6758bb7127657ab782

export function snapshotPrefix(siteId: string, snapshotId: string): string {
  return `snapshots/${siteId}/${snapshotId}/`;
}

export function mediaPrefix(siteId: string): string {
  return `media/${siteId}/`;
}

export function importPrefix(importId: string): string {
  return `imports/${importId}/`;
}

function prefixDir(storagePrefix: string): string {
  return storagePrefix.endsWith("/") ? storagePrefix : `${storagePrefix}/`;
}

/** Source files the editor changes, including include directives. */
export function sourcePrefix(storagePrefix: string): string {
  return `${prefixDir(storagePrefix)}src/`;
}

/** Public files. Preview, the live host, and CloudFront read this tree. */
export function outputPrefix(storagePrefix: string): string {
  return `${prefixDir(storagePrefix)}out/`;
}

/** Build manifest for one snapshot. Not part of the public tree. */
export function manifestKey(storagePrefix: string): string {
  return `${prefixDir(storagePrefix)}.flagstage/manifest.json`;
}

export function assertSafeKey(key: string): string {
  if (
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error("Unsafe storage key");
  }
  return key;
}
