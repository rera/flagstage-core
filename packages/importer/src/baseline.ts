import {
  BASELINE_PATH,
  coverBaseline,
  inventoryPages,
  isContentPage,
  listingMatcher,
  serializeBaseline
} from "@flagstage/sitebuild";

import type { CapturedFile, ImportResult, RedirectRule } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** HTML the importer returned, before shared blocks are pulled into includes. */
export function originalPages(
  files: Array<{ path: string; body: Uint8Array }>
): Array<{ path: string; html: string }> {
  const pages: Array<{ path: string; html: string }> = [];
  for (const file of files) {
    if (!isContentPage(file.path)) continue;
    try {
      pages.push({ path: file.path, html: decoder.decode(file.body) });
    } catch {
      // A page that is not UTF-8 is still stored. It has no text inventory.
    }
  }
  return pages;
}

/**
 * Record the original text, links, and images, and which pages a generated
 * listing or a 301 is allowed to replace. Publish reads this file.
 */
export function addBaseline<T extends { pages: CapturedFile[]; redirects: RedirectRule[] }>(
  result: T,
  originals: Array<{ path: string; html: string }>
): T {
  const kept = new Set(result.pages.map((file) => file.path));
  const listings = result.pages.find((file) => file.path === ".flagstage/listings.json");
  let listingsJson: string | null = null;
  if (listings) {
    try {
      listingsJson = decoder.decode(listings.body);
    } catch {
      listingsJson = null;
    }
  }
  const generated = listingMatcher(listingsJson);
  const removed = originals
    .map((page) => page.path)
    .filter((path) => !kept.has(path) || generated(path));
  const baseline = coverBaseline(inventoryPages(originals), removed, result.redirects);
  const file: CapturedFile = {
    path: BASELINE_PATH,
    body: encoder.encode(serializeBaseline(baseline)),
    contentType: "application/json"
  };
  return {
    ...result,
    pages: [...result.pages.filter((item) => item.path !== BASELINE_PATH), file]
  };
}

export function withImportBaseline(
  result: ImportResult,
  importedPages: CapturedFile[]
): ImportResult {
  return addBaseline(result, originalPages(importedPages));
}
