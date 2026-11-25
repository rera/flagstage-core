import type { ImportOptions } from "./interface";
import { originOf, sameOriginPath } from "./site-url";
import type { CapturedFile, FidelityItem, ImportResult, MappedForm, RedirectRule } from "./types";

const TEXT = new TextDecoder();

function storagePath(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (path === "/") return "index.html";
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "index.html";
  const last = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  if (last.includes(".")) return trimmed;
  return `${trimmed}/index.html`;
}

export type AnnotatedForm = MappedForm & {
  /** Substring of the opening form tag. The crawl points that form at the lead endpoint. */
  marker?: string;
};

export type PageAnnotation = {
  forms?: FidelityItem[];
  plugins?: FidelityItem[];
  formsMapped?: AnnotatedForm[];
};

export type CrawlOptions = ImportOptions & {
  /** Paths to visit before following links. Defaults to `/`. */
  seeds?: readonly string[];
  /** Redirects recorded with the crawl. The crawler does not invent any. */
  redirects?: readonly RedirectRule[];
  /** Extra fidelity notes and form mappings for one HTML page. */
  annotatePage?: (html: string, page: string) => PageAnnotation | null | undefined;
};

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

function rewriteHtml(
  html: string,
  origin: URL,
  appOrigin: string,
  siteId: string,
  forms: AnnotatedForm[]
): string {
  let next = html.replaceAll(origin.origin, "");
  for (const form of forms) {
    if (!form.marker) continue;
    const marker = form.marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const action = `${appOrigin}/f/${siteId}/${form.formKey}`;
    next = next.replace(new RegExp(`<form\\b([^>]*${marker}[^>]*)>`, "i"), (tag) => {
      const stripped = tag.replace(/\saction=["'][^"']*["']/i, "");
      return stripped.replace(/<form\b/i, `<form action="${action}"`);
    });
  }
  return next;
}

export async function crawlSite(input: CrawlOptions): Promise<ImportResult> {
  if (!input.fetchPage) throw new Error("The importer needs a page fetch.");
  const fetchPage = input.fetchPage;
  const origin = originOf(input.sourceUrl);
  const home = await fetchPage(origin.origin);
  if (!home || home.status >= 400) {
    throw new Error("The site did not answer.");
  }
  const seeds = new Set<string>();
  for (const path of input.seeds ?? ["/"]) {
    if (path) seeds.add(path);
  }
  if (seeds.size === 0) seeds.add("/");
  const redirects: RedirectRule[] = [...(input.redirects ?? [])];

  const queue = [...seeds].map((path) => ({ path, depth: 0 }));
  const seenPages = new Set<string>();
  const seenAssets = new Set<string>();
  const pages: CapturedFile[] = [];
  const assets: CapturedFile[] = [];
  const forms: FidelityItem[] = [];
  const plugins: FidelityItem[] = [];
  const mapped: MappedForm[] = [];
  const cssBackgrounds: string[] = [];
  const missingAssets: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  while (queue.length > 0 && seenPages.size < input.caps.maxPages) {
    const current = queue.shift();
    if (!current || seenPages.has(current.path) || current.depth > input.caps.maxDepth) continue;
    seenPages.add(current.path);
    const response = await fetchPage(new URL(current.path, origin).toString());
    if (!response || response.status >= 400) {
      missingAssets.push(current.path);
      skipped.push({
        path: current.path,
        reason: response ? `HTTP ${response.status}` : "No response"
      });
      await input.onProgress?.({
        pagesFound: seenPages.size + queue.length,
        pagesDone: seenPages.size,
        skipped
      });
      continue;
    }
    const contentType = response.contentType.toLowerCase();
    if (!contentType.includes("html")) {
      if (seenAssets.size < input.caps.maxAssets) {
        seenAssets.add(current.path);
        assets.push({
          path: storagePath(current.path),
          body: response.body,
          contentType: response.contentType
        });
      }
      continue;
    }
    const html = TEXT.decode(response.body);
    const extra = input.annotatePage?.(html, current.path);
    const pageForms = extra?.forms ?? [];
    const pagePlugins = [...searchNotes(html, current.path), ...(extra?.plugins ?? [])];
    const pageMapped = extra?.formsMapped ?? [];
    forms.push(...pageForms);
    plugins.push(...pagePlugins);
    for (const form of pageMapped) {
      mapped.push({ formKey: form.formKey, name: form.name, page: form.page });
    }
    const rewritten = rewriteHtml(html, origin, input.appOrigin, input.siteId, pageMapped);
    pages.push({
      path: storagePath(current.path),
      body: new TextEncoder().encode(rewritten),
      contentType: "text/html; charset=utf-8"
    });
    const links = [
      ...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi),
      ...cssUrls(html).map((url) => ["", url] as RegExpMatchArray)
    ];
    for (const match of links) {
      const raw = match[1];
      if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("data:"))
        continue;
      const path = sameOriginPath(raw, origin);
      if (!path) continue;
      const pathname = path.split("?")[0] || "/";
      const isAsset = pathname.split("/").pop()?.includes(".") === true;
      if (isAsset) {
        if (seenAssets.has(pathname) || seenAssets.size >= input.caps.maxAssets) continue;
        const asset = await fetchPage(new URL(pathname, origin).toString());
        if (!asset || asset.status >= 400) {
          missingAssets.push(pathname);
          if (
            cssUrls(html).some((url) => sameOriginPath(url, origin)?.split("?")[0] === pathname)
          ) {
            cssBackgrounds.push(pathname);
          }
          continue;
        }
        seenAssets.add(pathname);
        assets.push({
          path: storagePath(pathname),
          body: asset.body,
          contentType: asset.contentType || "application/octet-stream"
        });
      } else if (!seenPages.has(pathname) && current.depth + 1 <= input.caps.maxDepth) {
        queue.push({ path: pathname, depth: current.depth + 1 });
      }
    }
    await input.onProgress?.({
      pagesFound: seenPages.size + queue.length,
      pagesDone: seenPages.size,
      skipped
    });
  }

  return {
    pages,
    assets,
    redirects,
    report: { forms, plugins, missingAssets, cssBackgrounds, uncertain: [] },
    forms: mapped,
    stats: {
      pages: seenPages.size,
      assets: seenAssets.size,
      pagesFound: seenPages.size,
      pagesDone: seenPages.size,
      skipped
    }
  };
}
