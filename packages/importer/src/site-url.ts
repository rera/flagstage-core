import type { PageFetch } from "./types";

const TEXT = new TextDecoder();

export function originOf(sourceUrl: string): URL {
  const url = new URL(sourceUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function sameOriginPath(value: string, origin: URL): string | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin.origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Same-origin pathname used as a page identity. Trailing slashes are folded, except `/`. */
export function normalizeSitePath(value: string, origin: URL): string | null {
  const path = sameOriginPath(value, origin);
  if (!path) return null;
  let pathname = path.split("?")[0] || "/";
  try {
    pathname = decodeURI(pathname);
  } catch {
    // Keep the raw path when a percent-encoding sequence is invalid.
  }
  if (!pathname.startsWith("/")) return null;
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => decodeXml((match[1] ?? "").trim()))
    .filter(Boolean);
}

export function sitemapKind(xml: string): "index" | "urlset" {
  return /<sitemapindex[\s>]/i.test(xml) ? "index" : "urlset";
}

export async function fetchText(fetchPage: PageFetch, url: string): Promise<string | null> {
  const response = await fetchPage(url);
  if (!response || response.status >= 400) return null;
  return TEXT.decode(response.body);
}
