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

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

export async function fetchText(fetchPage: PageFetch, url: string): Promise<string | null> {
  const response = await fetchPage(url);
  if (!response || response.status >= 400) return null;
  return TEXT.decode(response.body);
}
