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
  /** Internal note. Site owners do not see this. */
  detail: string;
  /**
   * One plain sentence for a shared block left on the page.
   * Absent on other fidelity rows.
   */
  explanation?: string;
};

export type FidelityReport = {
  forms: FidelityItem[];
  plugins: FidelityItem[];
  missingAssets: string[];
  cssBackgrounds: string[];
  /**
   * Shared-looking blocks left inline. `drift` is close to a block that was
   * extracted. `near-duplicate` is a cluster with no single exact copy on
   * most pages. A miss here is a missed include; the page bytes stay.
   */
  uncertain: FidelityItem[];
  /**
   * Built pages that still post a form to the imported site.
   * Overview reads this. The detail stays off the editor.
   */
  legacyForms?: Array<{
    page: string;
    kind: string;
    detail: string;
  }>;
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
  stage?: "discovering" | "crawling" | "rewriting";
  pagesFound?: number;
  pagesDone?: number;
  pagesProcessed?: number;
  skipped?: SkippedPage[];
};

export type ImportResult = {
  pages: CapturedFile[];
  assets: CapturedFile[];
  redirects: RedirectRule[];
  forms: MappedForm[];
  report: FidelityReport;
  stats: ImportStats;
  /**
   * Set when page and asset bytes were streamed under this prefix
   * (`files/` plus the storage path). `body` may be empty until read back.
   */
  capturePrefix?: string;
};
