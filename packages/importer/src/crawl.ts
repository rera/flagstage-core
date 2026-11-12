import type {
  CapturedFile,
  CrawlResult,
  FidelityItem,
  ImportCaps,
  MappedForm,
  PageFetch,
  RedirectRule
} from "./types";

const TEXT = new TextDecoder();

function originOf(sourceUrl: string): URL {
  const url = new URL(sourceUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function sameOriginPath(value: string, origin: URL): string | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin.origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function storagePath(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (path === "/") return "index.html";
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "index.html";
  const last = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  if (last.includes(".")) return trimmed;
  return `${trimmed}/index.html`;
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

function pluginNotes(
  html: string,
  page: string
): { forms: FidelityItem[]; plugins: FidelityItem[]; formsMapped: MappedForm[] } {
  const forms: FidelityItem[] = [];
  const plugins: FidelityItem[] = [];
  const formsMapped: MappedForm[] = [];
  if (/wpcf7|contact-form-7/i.test(html)) {
    const id = html.match(/name="_wpcf7"\s+value="(\d+)"/i)?.[1] ?? "form";
    forms.push({ page, kind: "contact-form-7", detail: "Contact Form 7 markup was found." });
    formsMapped.push({ formKey: `cf7-${id}`, name: `Contact form ${id}`, page });
  }
  if (/gform_wrapper|gravityform/i.test(html)) {
    forms.push({ page, kind: "gravity-forms", detail: "Gravity Forms markup was found." });
    formsMapped.push({
      formKey: `gravity-${page.replace(/[^a-z0-9]+/gi, "-")}`,
      name: "Gravity form",
      page
    });
  }
  if (/id=["']commentform["']|wp-comments-post/i.test(html)) {
    plugins.push({
      page,
      kind: "comments",
      detail: "A comment form needs a server. It is not part of the static snapshot."
    });
  }
  if (/role=["']search["']|name=["']s["']/i.test(html)) {
    plugins.push({
      page,
      kind: "search",
      detail: "Site search does not run on a static snapshot."
    });
  }
  if (/wp-login\.php|id=["']loginform["']/i.test(html)) {
    plugins.push({ page, kind: "login", detail: "A login form was left behind." });
  }
  if (/tribe-events|wp-calendar|id=["']calendar["']/i.test(html)) {
    plugins.push({ page, kind: "calendar", detail: "A calendar plugin was found." });
  }
  return { forms, plugins, formsMapped };
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
  forms: MappedForm[]
): string {
  let next = html.replaceAll(origin.origin, "");
  for (const form of forms) {
    const marker = form.formKey.startsWith("cf7-") ? "wpcf7-form" : "gform_wrapper";
    const action = `${appOrigin}/f/${siteId}/${form.formKey}`;
    next = next.replace(new RegExp(`<form\\b([^>]*${marker}[^>]*)>`, "i"), (tag) => {
      const stripped = tag.replace(/\saction=["'][^"']*["']/i, "");
      return stripped.replace(/<form\b/i, `<form action="${action}"`);
    });
  }
  return next;
}

async function getText(fetchPage: PageFetch, url: string): Promise<string | null> {
  const response = await fetchPage(url);
  if (!response || response.status >= 400) return null;
  return TEXT.decode(response.body);
}

export async function crawlSite(input: {
  fetchPage: PageFetch;
  sourceUrl: string;
  appOrigin: string;
  siteId: string;
  caps: ImportCaps;
}): Promise<CrawlResult> {
  const origin = originOf(input.sourceUrl);
  const home = await input.fetchPage(origin.origin);
  if (!home || home.status >= 400) {
    throw new Error("The site did not answer.");
  }
  const wpJson = await getText(input.fetchPage, new URL("/wp-json", origin).toString());
  const wordpress = wpJson != null && wpJson.includes("{");
  const seeds = new Set<string>(["/"]);
  const redirects: RedirectRule[] = [
    { fromPath: "/feed", toPath: "/", source: "wordpress" },
    { fromPath: "/feed/", toPath: "/", source: "wordpress" },
    { fromPath: "/index.php", toPath: "/", source: "wordpress" }
  ];
  if (wordpress) {
    for (const sitemapPath of ["/wp-sitemap.xml", "/sitemap_index.xml"]) {
      const xml = await getText(input.fetchPage, new URL(sitemapPath, origin).toString());
      if (!xml) continue;
      for (const loc of locs(xml)) {
        const path = sameOriginPath(loc, origin);
        if (path) seeds.add(path.split("?")[0] || "/");
      }
    }
    for (const collection of ["pages", "posts"]) {
      const json = await getText(
        input.fetchPage,
        new URL(
          `/wp-json/wp/v2/${collection}?per_page=100&_fields=id,link,modified`,
          origin
        ).toString()
      );
      if (!json) continue;
      let rows: Array<{ id?: number; link?: string }> = [];
      try {
        const parsed = JSON.parse(json) as unknown;
        if (Array.isArray(parsed)) rows = parsed as Array<{ id?: number; link?: string }>;
      } catch {
        rows = [];
      }
      for (const row of rows) {
        if (!row.link) continue;
        const path = sameOriginPath(row.link, origin);
        if (!path) continue;
        const pathname = path.split("?")[0] || "/";
        seeds.add(pathname);
        if (typeof row.id === "number") {
          redirects.push({ fromPath: `/?p=${row.id}`, toPath: pathname, source: "wordpress" });
        }
      }
    }
  }

  const queue = [...seeds].map((path) => ({ path, depth: 0 }));
  const seenPages = new Set<string>();
  const seenAssets = new Set<string>();
  const files: CapturedFile[] = [];
  const forms: FidelityItem[] = [];
  const plugins: FidelityItem[] = [];
  const mapped: MappedForm[] = [];
  const cssBackgrounds: string[] = [];
  const missingAssets: string[] = [];

  while (queue.length > 0 && seenPages.size < input.caps.maxPages) {
    const current = queue.shift();
    if (!current || seenPages.has(current.path) || current.depth > input.caps.maxDepth) continue;
    seenPages.add(current.path);
    const response = await input.fetchPage(new URL(current.path, origin).toString());
    if (!response || response.status >= 400) {
      missingAssets.push(current.path);
      continue;
    }
    const contentType = response.contentType.toLowerCase();
    if (!contentType.includes("html")) {
      if (seenAssets.size < input.caps.maxAssets) {
        seenAssets.add(current.path);
        files.push({
          path: storagePath(current.path),
          body: response.body,
          contentType: response.contentType
        });
      }
      continue;
    }
    const html = TEXT.decode(response.body);
    const notes = pluginNotes(html, current.path);
    forms.push(...notes.forms);
    plugins.push(...notes.plugins);
    mapped.push(...notes.formsMapped);
    const rewritten = rewriteHtml(html, origin, input.appOrigin, input.siteId, notes.formsMapped);
    files.push({
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
        const asset = await input.fetchPage(new URL(pathname, origin).toString());
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
        files.push({
          path: storagePath(pathname),
          body: asset.body,
          contentType: asset.contentType || "application/octet-stream"
        });
      } else if (!seenPages.has(pathname) && current.depth + 1 <= input.caps.maxDepth) {
        queue.push({ path: pathname, depth: current.depth + 1 });
      }
    }
  }

  return {
    wordpress,
    files,
    redirects,
    report: { forms, plugins, missingAssets, cssBackgrounds },
    forms: mapped,
    stats: { pages: seenPages.size, assets: seenAssets.size }
  };
}
