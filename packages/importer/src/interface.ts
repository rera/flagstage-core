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

export type Importer = {
  name: string;
  run(options: ImportOptions): Promise<ImportResult>;
};
