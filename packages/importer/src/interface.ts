import type { BlobStore } from "@flagstage/storage";

import type { ImportCaps, ImportResult, PageFetch, SkippedPage } from "./types";

/** What the crawl is doing. The import row stores this for the progress UI. */
export type ImportStage = "discovering" | "crawling" | "rewriting";

export type ImportProgress = {
  stage?: ImportStage;
  pagesFound: number;
  /** Pages finished. The current progress UI reads this field. */
  pagesDone: number;
  /** Pages finished. Same count as `pagesDone`; the progress UI can read this name. */
  pagesProcessed?: number;
  skipped: SkippedPage[];
};

export type ImportOptions = {
  sourceUrl: string;
  appOrigin: string;
  siteId: string;
  caps: ImportCaps;
  /**
   * Pages to import, as absolute URLs or same-origin paths.
   * When set, sitemap discovery and link following are not used.
   */
  urls?: readonly string[];
  /** Stream each captured file here instead of keeping every body on the result. */
  store?: BlobStore;
  /** Key prefix for streamed files and `progress.json`. Resume reads this prefix. */
  capturePrefix?: string;
  fetchPage?: PageFetch;
  onProgress?: (progress: ImportProgress) => Promise<void> | void;
};

/** A detector's answer for one URL. `null` means this importer does not recognize it. */
export type ImporterMatch = {
  match: boolean;
  confidence: number;
  evidence: string;
};

export type Importer = {
  id: string;
  label: string;
  detect(url: string, fetchPage: PageFetch): Promise<ImporterMatch | null> | ImporterMatch | null;
  run(options: ImportOptions): Promise<ImportResult>;
};

/** The importer chosen for a URL. */
export type ImporterChoice = {
  id: string;
  label: string;
  confidence: number;
  evidence: string;
};
