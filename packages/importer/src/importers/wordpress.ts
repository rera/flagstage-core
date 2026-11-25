import { crawlSite, type AnnotatedForm, type PageAnnotation } from "../crawl";
import { maybeGunzip } from "../discover";
import type { Importer, ImporterMatch } from "../interface";
import { fetchText, originOf, sameOriginPath, sitemapLocs } from "../site-url";
import type { FidelityItem, PageFetch, RedirectRule } from "../types";

export const WORDPRESS_IMPORTER_ID = "wordpress";

const TEXT = new TextDecoder();

function wordpressIndex(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const namespaces = (parsed as { namespaces?: unknown }).namespaces;
  if (!Array.isArray(namespaces)) return false;
  return namespaces.some((entry) => entry === "wp/v2");
}

async function detectWordPress(url: string, fetchPage: PageFetch): Promise<ImporterMatch | null> {
  let origin: URL;
  try {
    origin = originOf(url);
  } catch {
    return null;
  }
  const response = await fetchPage(new URL("/wp-json", origin).toString());
  if (!response || response.status >= 400) return null;
  if (!wordpressIndex(TEXT.decode(response.body))) return null;
  return {
    match: true,
    confidence: 0.95,
    evidence: "The site exposes the WordPress REST API at /wp-json."
  };
}

function wordpressNotes(html: string, page: string): PageAnnotation {
  const forms: FidelityItem[] = [];
  const plugins: FidelityItem[] = [];
  const formsMapped: AnnotatedForm[] = [];
  if (/wpcf7|contact-form-7/i.test(html)) {
    const id = html.match(/name="_wpcf7"\s+value="(\d+)"/i)?.[1] ?? "form";
    forms.push({ page, kind: "contact-form-7", detail: "Contact Form 7 markup was found." });
    formsMapped.push({
      formKey: `cf7-${id}`,
      name: `Contact form ${id}`,
      page,
      marker: "wpcf7-form"
    });
  }
  if (/gform_wrapper|gravityform/i.test(html)) {
    forms.push({ page, kind: "gravity-forms", detail: "Gravity Forms markup was found." });
    formsMapped.push({
      formKey: `gravity-${page.replace(/[^a-z0-9]+/gi, "-")}`,
      name: "Gravity form",
      page,
      marker: "gform_wrapper"
    });
  }
  if (/id=["']commentform["']|wp-comments-post/i.test(html)) {
    plugins.push({
      page,
      kind: "comments",
      detail: "A comment form needs a server. It is not part of the static snapshot."
    });
  }
  if (/wp-login\.php|id=["']loginform["']/i.test(html)) {
    plugins.push({ page, kind: "login", detail: "A login form was left behind." });
  }
  if (/tribe-events|wp-calendar|id=["']calendar["']/i.test(html)) {
    plugins.push({ page, kind: "calendar", detail: "A calendar plugin was found." });
  }
  if (/name=["']s["']/i.test(html) && !/role=["']search["']/i.test(html)) {
    plugins.push({
      page,
      kind: "search",
      detail: "Site search does not run on a static snapshot."
    });
  }
  return { forms, plugins, formsMapped };
}

async function wordpressDiscovery(origin: URL, fetchPage: PageFetch) {
  const seeds = new Set<string>(["/"]);
  const redirects: RedirectRule[] = [
    { fromPath: "/feed", toPath: "/", source: "wordpress" },
    { fromPath: "/feed/", toPath: "/", source: "wordpress" },
    { fromPath: "/index.php", toPath: "/", source: "wordpress" }
  ];
  for (const sitemapPath of ["/wp-sitemap.xml", "/sitemap_index.xml"]) {
    const sitemapUrl = new URL(sitemapPath, origin).toString();
    const response = await fetchPage(sitemapUrl);
    if (!response || response.status >= 400) continue;
    const xml = TEXT.decode(maybeGunzip(sitemapUrl, response.contentType, response.body));
    for (const loc of sitemapLocs(xml)) {
      const path = sameOriginPath(loc, origin);
      if (!path) continue;
      seeds.add(path.split("?")[0] || "/");
    }
  }
  for (const collection of ["pages", "posts"]) {
    const json = await fetchText(
      fetchPage,
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
  return { seeds: [...seeds], redirects };
}

export const wordpressImporter: Importer = {
  id: WORDPRESS_IMPORTER_ID,
  label: "WordPress",
  detect: detectWordPress,
  async run(input) {
    if (!input.fetchPage) throw new Error("The importer needs a page fetch.");
    const fetchPage = input.fetchPage;
    const origin = originOf(input.sourceUrl);
    const home = await fetchPage(origin.origin);
    if (!home || home.status >= 400) throw new Error("The site did not answer.");
    const discovered = await wordpressDiscovery(origin, fetchPage);
    return crawlSite({
      ...input,
      fetchPage,
      seeds: discovered.seeds,
      redirects: discovered.redirects,
      annotatePage: wordpressNotes
    });
  }
};
