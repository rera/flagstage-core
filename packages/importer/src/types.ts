export type Fetched = {
  status: number;
  body: Uint8Array;
  contentType: string;
};

export type PageFetch = (url: string) => Promise<Fetched | null>;

export type ImportCaps = {
  maxPages: number;
  maxDepth: number;
  maxAssets: number;
};

export type FidelityItem = {
  page: string;
  kind: string;
  detail: string;
};

export type FidelityReport = {
  forms: FidelityItem[];
  plugins: FidelityItem[];
  missingAssets: string[];
  cssBackgrounds: string[];
};

export type MappedForm = {
  formKey: string;
  name: string;
  page: string;
};

export type RedirectRule = {
  fromPath: string;
  toPath: string;
  source: string;
};

export type CapturedFile = {
  path: string;
  body: Uint8Array;
  contentType: string;
};

export type SkippedPage = {
  path: string;
  reason: string;
};

export type ImportStats = {
  pages: number;
  assets: number;
  pagesFound?: number;
  pagesDone?: number;
  skipped?: SkippedPage[];
};

export type ImportResult = {
  pages: CapturedFile[];
  assets: CapturedFile[];
  redirects: RedirectRule[];
  forms: MappedForm[];
  report: FidelityReport;
  stats: ImportStats;
};
