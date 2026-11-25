import type { ImportCaps, ImportResult, PageFetch, SkippedPage } from "./types";

export type ImportProgress = {
  pagesFound: number;
  pagesDone: number;
  skipped: SkippedPage[];
};

export type ImportOptions = {
  sourceUrl: string;
  appOrigin: string;
  siteId: string;
  caps: ImportCaps;
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
