/**
 * Content hashes of one build's public files.
 * JSON-serializable. Keys are relative paths using `/`, with no leading slash.
 * Values are lowercase sha256 hex of the file bytes.
 */
export interface BuildManifest {
  files: Record<string, string>;
}

/**
 * What changed since a previous {@link BuildManifest}.
 * Publish uploads `changed`, copies `unchanged` from the previous snapshot,
 * and deletes `removed`. Each list is sorted.
 */
export interface BuildDiff {
  changed: string[];
  removed: string[];
  unchanged: string[];
}

export interface BuildSiteOptions {
  /** Site source directory. Shared fragments live in `_inc/`. */
  sourceDir: string;
  /**
   * Directory that receives public files. It is replaced on success.
   * A thrown {@link SiteBuildError} leaves it unchanged.
   * It must not be the source directory or nested inside it.
   */
  outputDir: string;
  /**
   * Manifest from the previous successful build of this site.
   * When omitted, every output key is reported as changed.
   */
  previous?: BuildManifest;
}

export interface BuildResult {
  manifest: BuildManifest;
  diff: BuildDiff;
  /** Public files written to `outputDir`, including generated listing pages. */
  files: number;
  /** Output files that contained include directives. */
  stitched: number;
}
