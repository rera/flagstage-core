import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join, relative, sep } from "node:path";

import {
  clip,
  findClose,
  inventoryHtml,
  isContentPage,
  listingMatcher,
  normalizeNav,
  parseBaseline,
  subtract,
  type Baseline,
  type PageInventory
} from "./content";
import type { BuildDiff } from "./types";

/**
 * One page whose shared region is no longer the include recorded at import.
 * Drift warns. It blocks a publish only when the same edit also drops content.
 */
export interface DriftFinding {
  page: string;
  /** File stem, such as `header`. */
  block: string;
  /** A few diff lines, `inlined unchanged`, or `include line removed`. */
  snippet: string;
}

/** Text, a link, an image, or a page present in the compared tree and absent now. */
export interface MissingFinding {
  page: string;
  kind: "text" | "link" | "image" | "page";
  detail: string;
}

export interface PublishChecks {
  /** First import publish with lost content. Later publishes stay false. */
  blocked: boolean;
  drift: DriftFinding[];
  missing: MissingFinding[];
  /** Wall time for the drift and loss checks together. */
  ms: number;
}

export interface ReviewOptions {
  sourceDir: string;
  outputDir: string;
  /** Previous public tree. Used when `mode` is `later`. */
  previousDir?: string;
  /** From the build. When set, the later check reads only changed HTML. */
  diff?: BuildDiff;
  /** `import` compares against the stored baseline and can block. `later` warns. */
  mode: "import" | "later";
}

/** A later edit warns once this much visible text is gone. A short rewrite stays quiet. */
const LARGE_TEXT_LOSS = 40;
const CAP = 40;
const MARK = "<!--#include";

/**
 * Drift against `.flagstage/drift.json`, then lost content.
 * The first import publish blocks when text, links, images, or pages from the
 * import are missing. A later publish only reports large text loss, deleted
 * images, and removed pages. Current-page nav markers are spliced out first.
 */
export function reviewPublish(options: ReviewOptions): PublishChecks {
  const started = performance.now();
  const drift = capDrift(checkDrift(options.sourceDir));
  const missing =
    options.mode === "import"
      ? capMissing(checkEquivalence(options.sourceDir, options.outputDir))
      : capMissing(
          checkLater(
            options.previousDir,
            options.outputDir,
            options.diff,
            coveredPaths(options.sourceDir),
            listingPaths(options.sourceDir)
          )
        );
  return {
    blocked: options.mode === "import" && missing.length > 0,
    drift,
    missing,
    ms: performance.now() - started
  };
}

export function checkDrift(sourceDir: string): DriftFinding[] {
  const manifest = readDrift(sourceDir);
  if (!manifest) return [];
  const expected = new Map<string, Array<{ virtual: string; block: string; count: number }>>();
  for (const include of manifest.includes) {
    if (!include.virtual.startsWith("/_inc/")) continue;
    const counts = new Map<string, number>();
    for (const placement of include.placements) {
      if (!placement.page) continue;
      counts.set(placement.page, (counts.get(placement.page) ?? 0) + 1);
    }
    const block = blockName(include.virtual);
    for (const [page, count] of counts) {
      const list = expected.get(page) ?? [];
      list.push({ virtual: include.virtual, block, count });
      expected.set(page, list);
    }
  }
  const findings: DriftFinding[] = [];
  const bodies = new Map<string, string | null>();
  for (const page of [...expected.keys()].sort()) {
    const html = readText(join(sourceDir, page));
    const want = expected.get(page) ?? [];
    if (html === null) {
      for (const item of want) {
        findings.push({ page, block: item.block, snippet: "include line removed" });
      }
      continue;
    }
    const found = includeCounts(html);
    for (const item of want) {
      if ((found.get(item.virtual) ?? 0) >= item.count) continue;
      const body = includeBody(sourceDir, item.virtual, bodies);
      const region = body ? findRegion(html, body) : null;
      const snippet = region && body ? shortDiff(body, region) : "include line removed";
      findings.push({ page, block: item.block, snippet });
    }
  }
  return findings;
}

export function checkEquivalence(sourceDir: string, outputDir: string): MissingFinding[] {
  const baseline = readBaseline(sourceDir);
  if (!baseline) return [];
  const covered = new Set(baseline.covered.map((item) => item.path));
  const findings: MissingFinding[] = [];
  for (const page of baseline.pages) {
    if (covered.has(page.path)) continue;
    const html = readText(join(outputDir, page.path));
    if (html === null) {
      findings.push({ page: page.path, kind: "page", detail: "missing page" });
      continue;
    }
    findings.push(...missingContent(page.path, page, inventoryHtml(html), "all"));
  }
  return findings;
}

export function checkLater(
  previousDir: string | undefined,
  outputDir: string,
  diff: BuildDiff | undefined,
  covered: Set<string>,
  isListing: (rel: string) => boolean = () => false
): MissingFinding[] {
  if (!previousDir || !existsSync(previousDir)) return [];
  const removed = (diff ? diff.removed : missingFiles(previousDir, outputDir)).filter(isHtml);
  const changed = (diff ? diff.changed : changedFiles(previousDir, outputDir)).filter(isHtml);
  const findings: MissingFinding[] = [];
  for (const rel of removed) {
    if (covered.has(rel) || isListing(rel)) continue;
    findings.push({ page: rel, kind: "page", detail: "page removed" });
  }
  for (const rel of changed) {
    if (covered.has(rel) || isListing(rel)) continue;
    const previous = readText(join(previousDir, rel));
    const next = readText(join(outputDir, rel));
    if (previous === null || next === null || previous === next) continue;
    findings.push(...missingContent(rel, inventoryHtml(previous), inventoryHtml(next), "later"));
  }
  return findings;
}

function missingContent(
  page: string,
  expected: PageInventory,
  actual: PageInventory,
  mode: "all" | "later"
): MissingFinding[] {
  if (expected.sha256 === actual.sha256) return [];
  const findings: MissingFinding[] = [];
  const text = subtract(expected.text, actual.text);
  const images = subtract(expected.images, actual.images);
  const links = subtract(expected.links, actual.links);
  const textLost = text.reduce((sum, item) => sum + item.length, 0);
  const reportText = mode === "all" || textLost >= LARGE_TEXT_LOSS;
  if (reportText) {
    for (const value of text) {
      findings.push({ page, kind: "text", detail: `missing text "${clip(value)}"` });
    }
  }
  if (mode === "all") {
    for (const value of links) {
      findings.push({ page, kind: "link", detail: `missing link ${value}` });
    }
  }
  for (const value of images) {
    findings.push({ page, kind: "image", detail: `missing image ${value}` });
  }
  return findings;
}

function coveredPaths(sourceDir: string): Set<string> {
  return new Set(readBaseline(sourceDir)?.covered.map((item) => item.path) ?? []);
}

/** Generated listing files. Their text moves when an article is added, which is not a loss. */
function listingPaths(sourceDir: string): (rel: string) => boolean {
  return listingMatcher(readText(join(sourceDir, ".flagstage", "listings.json")));
}

function readBaseline(sourceDir: string): Baseline | null {
  const raw = readText(join(sourceDir, ".flagstage", "baseline.json"));
  if (raw === null) return null;
  return parseBaseline(raw);
}

interface DriftFile {
  includes: Array<{ virtual: string; placements: Array<{ page?: string }> }>;
}

function readDrift(sourceDir: string): DriftFile | null {
  const raw = readText(join(sourceDir, ".flagstage", "drift.json"));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as DriftFile;
    if (!parsed || !Array.isArray(parsed.includes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function includeCounts(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf(MARK, cursor);
    if (start < 0) break;
    const end = html.indexOf("-->", start + MARK.length);
    if (end < 0) break;
    const virtual = directiveAttr(html.slice(start + MARK.length, end), "virtual");
    if (virtual) counts.set(virtual, (counts.get(virtual) ?? 0) + 1);
    cursor = end + 3;
  }
  return counts;
}

function directiveAttr(raw: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i").exec(
    raw
  );
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function includeBody(
  sourceDir: string,
  virtual: string,
  cache: Map<string, string | null>
): string | null {
  const cached = cache.get(virtual);
  if (cached !== undefined) return cached;
  const rel = virtual.replace(/^\/+/, "");
  if (!rel.startsWith("_inc/") || rel.split("/").some((part) => part === ".." || part === "")) {
    cache.set(virtual, null);
    return null;
  }
  const text = readText(join(sourceDir, rel));
  cache.set(virtual, text);
  return text;
}

function findRegion(page: string, includeHtml: string): string | null {
  const name = rootTag(includeHtml);
  if (!name) return null;
  const candidates = elementsNamed(page, name);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;
  const includeText = inventoryHtml(includeHtml).text.join(" ");
  let best: string | null = null;
  let score = 0;
  for (const candidate of candidates) {
    const value = overlap(includeText, inventoryHtml(candidate).text.join(" "));
    if (value > score) {
      score = value;
      best = candidate;
    }
  }
  return score >= 0.34 ? best : null;
}

function rootTag(html: string): string | null {
  const match = /<([A-Za-z][-A-Za-z0-9]*)\b/.exec(html);
  return match?.[1]?.toLowerCase() ?? null;
}

function elementsNamed(html: string, name: string): string[] {
  const want = name.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt < 0) break;
    const info = /^<\s*(\/)?\s*([A-Za-z][-A-Za-z0-9]*)/.exec(html.slice(lt, gt + 1));
    const tag = info?.[2]?.toLowerCase();
    const closing = Boolean(info?.[1]);
    if (tag !== want || closing) {
      i = gt + 1;
      continue;
    }
    const closeAt = findClose(html, gt + 1, tag);
    if (!closeAt) {
      i = gt + 1;
      continue;
    }
    out.push(html.slice(lt, closeAt));
    i = closeAt;
  }
  return out;
}

function overlap(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return a.trim() === b.trim() ? 1 : 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2)
  );
}

function shortDiff(includeHtml: string, region: string): string {
  const before = normalizeNav(includeHtml);
  const after = normalizeNav(region);
  if (before === after) return "inlined unchanged";
  const left = before.split("\n");
  const right = after.split("\n");
  const lines: string[] = [];
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max && lines.length < 6; index += 1) {
    const removed = left[index];
    const added = right[index];
    if (removed === added) continue;
    if (removed !== undefined) lines.push(`- ${clip(removed, 100)}`);
    if (added !== undefined) lines.push(`+ ${clip(added, 100)}`);
  }
  return lines.join("\n") || "content differs";
}

function blockName(virtual: string): string {
  const base = virtual.slice(virtual.lastIndexOf("/") + 1).replace(/\.html?$/i, "");
  return base || virtual;
}

function capDrift(items: DriftFinding[]): DriftFinding[] {
  if (items.length <= CAP) return items;
  const extra = items.length - CAP;
  const page = items[0]?.page ?? "";
  return [...items.slice(0, CAP), { page, block: "more", snippet: `${extra} more drifted pages` }];
}

function capMissing(items: MissingFinding[]): MissingFinding[] {
  if (items.length <= CAP) return items;
  const extra = items.length - CAP;
  const page = items[0]?.page ?? "";
  return [...items.slice(0, CAP), { page, kind: "page", detail: `${extra} more missing items` }];
}

function isHtml(rel: string): boolean {
  return isContentPage(rel);
}

function missingFiles(previousDir: string, outputDir: string): string[] {
  const next = new Set(listHtml(outputDir));
  return listHtml(previousDir).filter((rel) => !next.has(rel));
}

function changedFiles(previousDir: string, outputDir: string): string[] {
  const previous = new Map(listHtml(previousDir).map((rel) => [rel, true]));
  return listHtml(outputDir).filter((rel) => previous.has(rel));
}

function listHtml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const rels: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "_inc" && entry.name !== "_templates" && entry.name !== ".flagstage") {
          stack.push(abs);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = toPosix(relative(dir, abs));
      if (isHtml(rel)) rels.push(rel);
    }
  }
  rels.sort();
  return rels;
}

function readText(path: string): string | null {
  try {
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function toPosix(rel: string): string {
  return sep === "/" ? rel : rel.split(sep).join("/");
}
