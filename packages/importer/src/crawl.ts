import type { BlobStore, StoredObject } from "@flagstage/storage";

import {
  captureFileKey,
  loadProgress,
  normalizeCapturePrefix,
  saveProgress,
  type CrawlProgress
} from "./capture";
import {
  allowAll,
  collectSitemapPages,
  CRAWLER_USER_AGENT,
  isAssetPath,
  pagePathsFromList,
  parseRobots,
  type RobotsRules
} from "./discover";
import type { ImportOptions, ImportProgress, ImportStage } from "./interface";
import {
  applyFormActions,
  mappedForms,
  rewriteCapturedHtml,
  type AnnotatedForm,
  type PageAnnotation
} from "./rewrite";
import { normalizeSitePath, originOf } from "./site-url";
import type {
  CapturedFile,
  FidelityItem,
  Fetched,
  ImportResult,
  MappedForm,
  PageFetch,
  RedirectRule
} from "./types";

const TEXT = new TextDecoder();

/** In-flight fetches for one host. The crawl uses this many workers unless a caller overrides it. */
export const DEFAULT_CRAWL_CONCURRENCY = 6;
/** Minimum spacing between fetches to one host. */
export const DEFAULT_HOST_INTERVAL_MS = 200;
const MAX_CRAWL_CONCURRENCY = 8;

export type { AnnotatedForm, PageAnnotation };

export type CrawlOptions = ImportOptions & {
  /** Paths to visit before following links. Defaults to `/`. Pass `[]` to skip that seed. */
  seeds?: readonly string[];
  /** Redirects recorded with the crawl. The crawler does not invent any. */
  redirects?: readonly RedirectRule[];
  /** Extra fidelity notes and form mappings for one HTML page. */
  annotatePage?: (html: string, page: string) => PageAnnotation | null | undefined;
  /** Workers for one host. Clamped to 1–8. Defaults to {@link DEFAULT_CRAWL_CONCURRENCY}. */
  concurrency?: number;
  /** Milliseconds between fetches to one host. Defaults to {@link DEFAULT_HOST_INTERVAL_MS}. */
  hostIntervalMs?: number;
};

type Mode = "list" | "sitemap" | "links";
type Job = { kind: "page"; path: string; depth: number } | { kind: "asset"; path: string };

export function storagePath(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (path === "/") return "index.html";
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "index.html";
  const last = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  if (last.includes(".")) return trimmed;
  return `${trimmed}/index.html`;
}

export function resolveCrawlConcurrency(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_CRAWL_CONCURRENCY;
  const whole = Math.floor(value);
  if (whole < 1) return 1;
  if (whole > MAX_CRAWL_CONCURRENCY) return MAX_CRAWL_CONCURRENCY;
  return whole;
}

function searchNotes(html: string, page: string): FidelityItem[] {
  if (!/role=["']search["']/i.test(html)) return [];
  return [
    {
      page,
      kind: "search",
      detail: "Site search does not run on a static snapshot."
    }
  ];
}

function cssUrls(html: string): string[] {
  return [...html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

function isHtml(response: Fetched): boolean {
  const type = response.contentType.toLowerCase();
  if (type.includes("html")) return true;
  if (
    type.includes("xml") ||
    type.includes("gzip") ||
    type.includes("image") ||
    type.includes("css") ||
    type.includes("javascript") ||
    type.includes("json")
  ) {
    return false;
  }
  const head = TEXT.decode(response.body.subarray(0, 64)).trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<head");
}

function seedPaths(seeds: readonly string[] | undefined, origin: URL): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const entry of seeds ?? ["/"]) {
    const path = normalizeSitePath(entry, origin);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

function mergePages(
  first: readonly string[],
  second: readonly string[],
  maxPages: number
): string[] {
  const pages: string[] = [];
  const seen = new Set<string>();
  for (const path of [...first, ...second]) {
    if (seen.has(path)) continue;
    seen.add(path);
    pages.push(path);
    if (pages.length >= maxPages) break;
  }
  return pages;
}

/**
 * Crawl one origin.
 *
 * Discovery reads robots.txt (Sitemap lines and Disallow for FlagstageCrawler)
 * and `/sitemap.xml`, including sitemap indexes, nested sitemaps, and gzip.
 * An explicit `urls` list is the page set instead. With no sitemap and no list,
 * the crawl follows same-origin links from the seeds.
 *
 * Each captured file is written to `store` as it is fetched. Pass `store` and
 * `capturePrefix` to stream and to resume from `progress.json` under that prefix.
 * Without a store, the result still carries the bytes.
 *
 * Links to imported pages and assets are root-relative. Links to pages that
 * were not imported stay absolute on the source origin.
 */
export async function crawlSite(input: CrawlOptions): Promise<ImportResult> {
  if (!input.fetchPage) throw new Error("The importer needs a page fetch.");
  const fetchPage = input.fetchPage;
  const origin = originOf(input.sourceUrl);
  const external = Boolean(input.store);
  const store = input.store ?? memoryStore();
  const prefix = normalizeCapturePrefix(
    input.capturePrefix ?? (external ? `imports/${input.siteId}/crawl/` : "capture/")
  );
  const concurrency = resolveCrawlConcurrency(input.concurrency);
  const pace = hostPacer(
    input.hostIntervalMs == null || !Number.isFinite(input.hostIntervalMs)
      ? DEFAULT_HOST_INTERVAL_MS
      : Math.max(0, input.hostIntervalMs)
  );
  const maxPages = input.caps.maxPages;
  const maxAssets = input.caps.maxAssets;
  const maxDepth = input.caps.maxDepth;
  const progress = await loadProgress(store, prefix, origin.origin);
  const donePages = new Set(progress.pages);
  const doneAssets = new Set(progress.assets);
  const redirects: RedirectRule[] = [...(input.redirects ?? [])];
  const forms: FidelityItem[] = [];
  const plugins: FidelityItem[] = [];
  const mapped: MappedForm[] = [];
  const prefetched = new Map<string, Fetched>();

  const report = async (stage: ImportStage, pagesFound: number) => {
    const pagesProcessed = progress.pages.length + progress.skipped.length;
    const body: ImportProgress = {
      stage,
      pagesFound,
      pagesDone: pagesProcessed,
      pagesProcessed,
      skipped: progress.skipped
    };
    await input.onProgress?.(body);
  };

  await report("discovering", donePages.size);
  const robots = await loadRobots(fetchPage, origin, pace);
  const seeds = seedPaths(input.seeds, origin).filter((path) => robots.allowed(path));
  const listed = pagePathsFromList(input.urls, origin);
  let mode: Mode;
  let planned: string[] = [];
  if (listed) {
    mode = "list";
    planned = listed.filter((path) => robots.allowed(path)).slice(0, Math.max(0, maxPages));
    if (planned.length === 0) throw new Error("robots.txt disallows this crawl.");
  } else {
    const sitemapUrls = [...robots.sitemaps, new URL("/sitemap.xml", origin).toString()];
    const discovered = await collectSitemapPages({
      fetchPage,
      origin,
      sitemapUrls,
      allow: (path) => robots.allowed(path),
      maxPages: Math.max(0, maxPages),
      pace
    });
    if (discovered.length > 0) {
      mode = "sitemap";
      planned = mergePages(seeds, discovered, Math.max(0, maxPages));
    } else {
      mode = "links";
      planned = seeds;
    }
    if (planned.length === 0) {
      throw new Error(
        robots.sitemaps.length > 0 || mode === "sitemap"
          ? "robots.txt disallows this crawl."
          : "The site did not answer."
      );
    }
  }

  if (robots.allowed("/") && !donePages.has("/")) {
    await pace();
    const home = await fetchPage(origin.origin);
    if (!home || home.status >= 400) throw new Error("The site did not answer.");
    prefetched.set("/", home);
  }

  const jobs: Job[] = [];
  const knownPages = new Set<string>();
  const claimed = new Set<string>();
  const assetCss = new Map<string, boolean>();
  let assetSlots = progress.assets.length;
  let visited = progress.pages.length + progress.skipped.length;
  let writing = Promise.resolve();
  let unsaved = 0;
  const pagesFound = () => (mode === "links" ? knownPages.size : planned.length);

  const persist = (force = false) => {
    unsaved += 1;
    if (!force && unsaved < 25) return Promise.resolve();
    unsaved = 0;
    const copy: CrawlProgress = {
      version: 1,
      origin: progress.origin,
      pages: [...progress.pages],
      assets: [...progress.assets],
      skipped: progress.skipped.map((item) => ({ ...item })),
      missingAssets: [...progress.missingAssets],
      cssBackgrounds: [...progress.cssBackgrounds]
    };
    writing = writing.then(() => saveProgress(store, prefix, copy));
    return writing;
  };

  await report("crawling", planned.length);

  const enqueuePage = (path: string, depth: number) => {
    if (!path || knownPages.has(path) || !robots.allowed(path)) return;
    if (mode === "links" && depth > maxDepth) return;
    knownPages.add(path);
    jobs.push({ kind: "page", path, depth });
  };

  const enqueueAsset = (path: string, fromCss: boolean) => {
    if (!path || !robots.allowed(path) || doneAssets.has(path)) return;
    const previous = assetCss.get(path);
    if (previous != null) {
      if (fromCss) assetCss.set(path, true);
      return;
    }
    if (assetSlots >= maxAssets) return;
    assetCss.set(path, fromCss);
    assetSlots += 1;
    jobs.push({ kind: "asset", path });
  };

  const rememberLinks = (html: string, depth: number) => {
    for (const link of linksIn(html)) {
      const path = normalizeSitePath(link.raw, origin);
      if (!path) continue;
      if (isAssetPath(path)) enqueueAsset(path, link.fromCss);
      else if (mode === "links") enqueuePage(path, depth + 1);
    }
  };

  const processPage = async (path: string, depth: number) => {
    if (claimed.has(path)) return;
    claimed.add(path);
    if (donePages.has(path)) {
      if (mode === "links") {
        const stored = await store.get(captureFileKey(prefix, storagePath(path)));
        if (stored) rememberLinks(TEXT.decode(stored.body), depth);
      }
      return;
    }
    if (visited >= maxPages) return;
    visited += 1;
    const cached = prefetched.get(path);
    let response: Fetched | null;
    if (cached) {
      prefetched.delete(path);
      response = cached;
    } else {
      await pace();
      response = await fetchPage(new URL(path, origin).toString());
    }
    if (!response || response.status >= 400) {
      progress.skipped.push({
        path,
        reason: response ? `HTTP ${response.status}` : "No response"
      });
      pushUnique(progress.missingAssets, path);
      await persist();
      await report("crawling", pagesFound());
      return;
    }
    if (!isHtml(response)) {
      await storeAsset(path, response, false);
      await report("crawling", pagesFound());
      return;
    }
    await store.put(
      captureFileKey(prefix, storagePath(path)),
      response.body,
      "text/html; charset=utf-8"
    );
    progress.pages.push(path);
    donePages.add(path);
    await persist();
    rememberLinks(TEXT.decode(response.body), depth);
    await report("crawling", pagesFound());
  };

  const storeAsset = async (path: string, response: Fetched, fromCss: boolean) => {
    if (doneAssets.has(path)) return;
    if (!assetCss.has(path)) {
      if (assetSlots >= maxAssets) return;
      assetCss.set(path, fromCss);
      assetSlots += 1;
    }
    await store.put(
      captureFileKey(prefix, storagePath(path)),
      response.body,
      response.contentType || "application/octet-stream"
    );
    progress.assets.push(path);
    doneAssets.add(path);
    await persist();
  };

  const processAsset = async (path: string) => {
    if (doneAssets.has(path)) return;
    await pace();
    const response = await fetchPage(new URL(path, origin).toString());
    if (!response || response.status >= 400) {
      if (assetCss.get(path)) pushUnique(progress.cssBackgrounds, path);
      pushUnique(progress.missingAssets, path);
      assetSlots -= 1;
      await persist();
      return;
    }
    if (!assetCss.has(path)) {
      assetCss.set(path, false);
      assetSlots += 1;
    }
    await store.put(
      captureFileKey(prefix, storagePath(path)),
      response.body,
      response.contentType || "application/octet-stream"
    );
    progress.assets.push(path);
    doneAssets.add(path);
    await persist();
  };

  for (const path of planned) {
    knownPages.add(path);
    jobs.push({ kind: "page", path, depth: 0 });
  }
  await runJobs(jobs, concurrency, async (job) => {
    if (job.kind === "page") await processPage(job.path, job.depth);
    else await processAsset(job.path);
  });

  await persist(true);
  const imported = new Set<string>([...progress.pages, ...progress.assets]);
  await report("rewriting", pagesFound());
  const pagePaths = [...progress.pages];
  await runJobs(pagePaths, concurrency, async (path) => {
    const key = captureFileKey(prefix, storagePath(path));
    const object = await store.get(key);
    if (!object) return;
    const html = TEXT.decode(object.body);
    const extra = input.annotatePage?.(html, path);
    const pageForms = extra?.forms ?? [];
    const pagePlugins = [...searchNotes(html, path), ...(extra?.plugins ?? [])];
    const pageMapped = extra?.formsMapped ?? [];
    forms.push(...pageForms);
    plugins.push(...pagePlugins);
    mapped.push(...mappedForms(pageMapped));
    const rewritten = applyFormActions(
      rewriteCapturedHtml(html, origin, imported),
      input.appOrigin,
      input.siteId,
      pageMapped
    );
    await store.put(key, new TextEncoder().encode(rewritten), "text/html; charset=utf-8");
  });
  await persist(true);

  const pages = await filesFor(store, prefix, progress.pages, external, "text/html; charset=utf-8");
  const assets = await assetFiles(store, prefix, progress.assets, external);
  const pagesProcessed = progress.pages.length + progress.skipped.length;
  return {
    pages,
    assets,
    redirects,
    report: {
      forms,
      plugins,
      missingAssets: progress.missingAssets,
      cssBackgrounds: progress.cssBackgrounds,
      uncertain: []
    },
    forms: mapped,
    stats: {
      pages: visited,
      assets: progress.assets.length,
      stage: "rewriting",
      pagesFound: pagesFound(),
      pagesDone: pagesProcessed,
      pagesProcessed,
      skipped: progress.skipped
    },
    ...(external ? { capturePrefix: prefix } : {})
  };
}

async function loadRobots(
  fetchPage: PageFetch,
  origin: URL,
  pace: () => Promise<void>
): Promise<RobotsRules> {
  await pace();
  const response = await fetchPage(new URL("/robots.txt", origin).toString());
  if (!response || response.status >= 400) return allowAll();
  const type = response.contentType.toLowerCase();
  if (type.includes("html")) return allowAll();
  return parseRobots(TEXT.decode(response.body), CRAWLER_USER_AGENT);
}

function linksIn(html: string): Array<{ raw: string; fromCss: boolean }> {
  const found: Array<{ raw: string; fromCss: boolean }> = [];
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (raw) found.push({ raw, fromCss: false });
  }
  for (const match of html.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
    for (const part of (match[1] ?? "").split(",")) {
      const raw = part.trim().split(/\s+/)[0];
      if (raw) found.push({ raw, fromCss: false });
    }
  }
  for (const raw of cssUrls(html)) found.push({ raw, fromCss: true });
  return found;
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

async function filesFor(
  store: BlobStore,
  prefix: string,
  paths: readonly string[],
  external: boolean,
  contentType: string
): Promise<CapturedFile[]> {
  const files: CapturedFile[] = [];
  for (const path of paths) {
    const storedPath = storagePath(path);
    if (external) {
      files.push({ path: storedPath, body: new Uint8Array(), contentType });
      continue;
    }
    const object = await store.get(captureFileKey(prefix, storedPath));
    files.push({
      path: storedPath,
      body: object?.body ?? new Uint8Array(),
      contentType: object?.contentType || contentType
    });
  }
  return files;
}

async function assetFiles(
  store: BlobStore,
  prefix: string,
  paths: readonly string[],
  external: boolean
): Promise<CapturedFile[]> {
  const files: CapturedFile[] = [];
  for (const path of paths) {
    const storedPath = storagePath(path);
    if (external) {
      files.push({
        path: storedPath,
        body: new Uint8Array(),
        contentType: "application/octet-stream"
      });
      continue;
    }
    const object = await store.get(captureFileKey(prefix, storedPath));
    files.push({
      path: storedPath,
      body: object?.body ?? new Uint8Array(),
      contentType: object?.contentType || "application/octet-stream"
    });
  }
  return files;
}

function hostPacer(intervalMs: number): () => Promise<void> {
  let chain = Promise.resolve();
  let nextAt = 0;
  return () => {
    const scheduled = chain.then(async () => {
      const now = Date.now();
      const start = Math.max(now, nextAt);
      nextAt = start + intervalMs;
      const wait = start - now;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    });
    chain = scheduled.then(
      () => undefined,
      () => undefined
    );
    return scheduled;
  };
}

async function runJobs<T>(
  jobs: T[],
  concurrency: number,
  handler: (job: T) => Promise<void>
): Promise<void> {
  let next = 0;
  let active = 0;
  let settled = false;
  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const launch = () => {
      if (settled) return;
      while (active < concurrency && next < jobs.length) {
        const job = jobs[next];
        next += 1;
        if (job === undefined) continue;
        active += 1;
        handler(job)
          .then(() => {
            active -= 1;
            launch();
          })
          .catch(fail);
      }
      if (active === 0 && next >= jobs.length) succeed();
    };
    launch();
  });
}

function memoryStore(): BlobStore & { files: Map<string, StoredObject> } {
  const files = new Map<string, StoredObject>();
  return {
    files,
    async put(key, body, contentType) {
      files.set(key, { body, contentType: contentType ?? "application/octet-stream" });
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async list(prefix) {
      return [...files.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, size: files.get(key)?.body.byteLength ?? 0 }));
    },
    async delete(key) {
      files.delete(key);
    },
    async copy(from, to) {
      const object = files.get(from);
      if (!object) throw new Error(`Missing ${from}`);
      files.set(to, { body: new Uint8Array(object.body), contentType: object.contentType });
    }
  };
}

export { CRAWLER_USER_AGENT };
