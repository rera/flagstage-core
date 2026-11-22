import { createHash } from "node:crypto";

import type { BuildDiff, BuildManifest } from "./types";

export function sha256(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

/** Compare two output manifests. Lists are sorted and the inputs are not changed. */
export function diffManifests(previous: BuildManifest, next: BuildManifest): BuildDiff {
  const changed: string[] = [];
  const unchanged: string[] = [];
  const removed: string[] = [];
  const previousFiles = previous.files;
  const nextFiles = next.files;
  for (const key of Object.keys(nextFiles)) {
    const hash = nextFiles[key];
    if (Object.hasOwn(previousFiles, key) && previousFiles[key] === hash) unchanged.push(key);
    else changed.push(key);
  }
  for (const key of Object.keys(previousFiles)) {
    if (!Object.hasOwn(nextFiles, key)) removed.push(key);
  }
  changed.sort();
  removed.sort();
  unchanged.sort();
  return { changed, removed, unchanged };
}

export function manifestFrom(hashes: Map<string, string>): BuildManifest {
  const files: Record<string, string> = {};
  for (const key of [...hashes.keys()].sort()) {
    const hash = hashes.get(key);
    if (hash !== undefined) files[key] = hash;
  }
  return { files };
}
