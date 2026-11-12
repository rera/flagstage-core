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
