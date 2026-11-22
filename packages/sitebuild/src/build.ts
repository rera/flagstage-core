import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { SiteBuildError } from "./errors";
import { diffManifests, manifestFrom, sha256 } from "./manifest";
import { createStitcher } from "./stitch";
import type { BuildDiff, BuildResult, BuildSiteOptions } from "./types";

/** Directory names omitted from public output, at any depth. */
export const PRIVATE_DIRECTORIES = ["_inc", "_templates", ".flagstage"] as const;

const PRIVATE = new Set<string>(PRIVATE_DIRECTORIES);
const INCLUDE_MARK = Buffer.from("<!--#include");

/**
 * Resolve SSI includes in `sourceDir` and write public files to `outputDir`.
 *
 * Publish and preview should call this on the snapshot source tree, then upload
 * or serve the output. Includes are resolved here and never on the request path.
 * Listing pages and drift checks are not part of this build, and nothing here
 * talks to object storage.
 *
 * Source pages pull in shared chrome with directives:
 *
 * ```html
 * <!--#include virtual="/_inc/header.html" -->
 * <!--#include virtual="/_inc/header.html" active="/news" -->
 * ```
 *
 * `virtual` is a site-root path and must name a file inside `/_inc/`. Nested
 * includes are resolved. A missing file or a cycle throws {@link SiteBuildError}.
 * `active` rewrites the first exact `<a href="/news">` in that fragment to
 * `<a href="/news" class="active" aria-current="page">`. The rewrite is a string
 * splice after nested includes are resolved, not an HTML parse, so the include
 * should keep the nav link in that exact form.
 *
 * Directories named `_inc`, `_templates`, and `.flagstage` are omitted.
 * Other regular files are copied unchanged. Symbolic links are not followed.
 *
 * The manifest maps each output key (relative, `/`-separated, no leading slash)
 * to the sha256 of its bytes. Pass the previous manifest as `previous` and
 * publish from `result.diff`: upload `changed`, copy `unchanged` from the
 * previous snapshot, and delete `removed`. The output directory is always a
 * full tree. A thrown error leaves `outputDir` as it was.
 *
 * Synchronous. Run it from the publish or import task, not a request handler.
 */
export function buildSite(options: BuildSiteOptions): BuildResult {
  const source = existingSource(options.sourceDir);
  const output = resolve(options.outputDir);
  assertOutputDir(source, output);

  const parent = dirname(output);
  mkdirSync(parent, { recursive: true });
  const temp = mkdtempSync(join(parent, `.${basename(output)}-sitebuild-`));
  const made = new Set<string>();
  try {
    const stitcher = createStitcher(source);
    const hashes = new Map<string, string>();
    let stitched = 0;
    for (const rel of listFiles(source)) {
      const body = readSource(source, rel);
      let outputBody = body;
      if (body.includes(INCLUDE_MARK)) {
        outputBody = Buffer.from(stitcher.stitch(body.toString("utf8"), rel), "utf8");
        stitched += 1;
      }
      writeOutput(temp, rel, outputBody, made);
      hashes.set(rel, sha256(outputBody));
    }
    const manifest = manifestFrom(hashes);
    const diff: BuildDiff = options.previous
      ? diffManifests(options.previous, manifest)
      : { changed: Object.keys(manifest.files).sort(), removed: [], unchanged: [] };
    rmSync(output, { recursive: true, force: true });
    renameSync(temp, output);
    return { manifest, diff, files: hashes.size, stitched };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

function existingSource(sourceDir: string): string {
  const source = resolve(sourceDir);
  let info;
  try {
    info = statSync(source);
  } catch {
    throw new SiteBuildError("bad-path", `Source directory not found: ${source}`);
  }
  if (!info.isDirectory()) {
    throw new SiteBuildError("bad-path", `Source path is not a directory: ${source}`);
  }
  return source;
}

function assertOutputDir(source: string, output: string): void {
  if (output === parse(output).root) {
    throw new SiteBuildError("bad-path", "Refusing to replace the filesystem root");
  }
  if (isInside(source, output) || isInside(output, source)) {
    throw new SiteBuildError(
      "bad-path",
      `Output directory must be outside the source directory (${source})`
    );
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  if (rel === "") return true;
  if (isAbsolute(rel)) return false;
  return !rel.split(sep).includes("..");
}

function listFiles(source: string): string[] {
  const rels: string[] = [];
  const stack = [source];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "." || entry.name === "..") continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!PRIVATE.has(entry.name)) stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = toPosix(relative(source, abs));
      assertSafeRel(rel);
      rels.push(rel);
    }
  }
  rels.sort();
  return rels;
}

function assertSafeRel(rel: string): void {
  if (
    rel === "" ||
    rel.startsWith("/") ||
    rel.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new SiteBuildError("bad-path", `Refusing to publish "${rel}"`);
  }
}

function readSource(source: string, rel: string): Buffer {
  try {
    return readFileSync(join(source, rel));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SiteBuildError("bad-path", `Could not read ${rel}: ${detail}`);
  }
}

function writeOutput(root: string, rel: string, body: Buffer, made: Set<string>): void {
  const abs = join(root, rel);
  const dir = dirname(abs);
  if (!made.has(dir)) {
    mkdirSync(dir, { recursive: true });
    made.add(dir);
  }
  writeFileSync(abs, body);
}

function toPosix(rel: string): string {
  return sep === "/" ? rel : rel.split(sep).join("/");
}
