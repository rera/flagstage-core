import { gunzipSync } from "node:zlib";

import { decodeXml, normalizeSitePath, sitemapKind, sitemapLocs } from "./site-url";
import type { PageFetch } from "./types";

/** Product token matched against robots.txt groups. Sent as the default User-Agent. */
export const CRAWLER_USER_AGENT = "FlagstageCrawler";

const MAX_SITEMAP_DOCS = 1_000;
const MAX_SITEMAP_BYTES = 32 * 1024 * 1024;

export type RobotsRules = {
  sitemaps: string[];
  allowed(path: string): boolean;
};

type Rule = { allow: boolean; path: string };
type Group = { agents: string[]; rules: Rule[] };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleMatches(pattern: string, path: string): boolean {
  if (!pattern.startsWith("/")) return false;
  if (pattern.includes("*") || pattern.endsWith("$")) {
    const anchor = pattern.endsWith("$");
    const body = anchor ? pattern.slice(0, -1) : pattern;
    const expression = `^${body.split("*").map(escapeRegExp).join(".*")}${anchor ? "$" : ""}`;
    return new RegExp(expression).test(path);
  }
  return path.startsWith(pattern);
}

/**
 * robots.txt for our crawler. A group whose user-agent is a token of
 * `FlagstageCrawler` wins over `User-agent: *`. Sitemap lines are global.
 * The longest matching Allow or Disallow wins, and Allow wins a tie.
 */
export function parseRobots(text: string, userAgent: string = CRAWLER_USER_AGENT): RobotsRules {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let group: Group | null = null;
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const split = line.indexOf(":");
    if (split <= 0) continue;
    const field = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      const agent = value.toLowerCase();
      if (!agent) continue;
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(agent);
      continue;
    }
    if ((field === "allow" || field === "disallow") && group) {
      group.rules.push({ allow: field === "allow", path: value });
    }
  }

  const token = userAgent.toLowerCase();
  let best = 0;
  for (const candidate of groups) {
    for (const agent of candidate.agents) {
      if (agent === "*") continue;
      if (token.includes(agent)) best = Math.max(best, agent.length);
    }
  }
  const chosen =
    best > 0
      ? groups.filter((candidate) =>
          candidate.agents.some(
            (agent) => agent !== "*" && token.includes(agent) && agent.length === best
          )
        )
      : groups.filter((candidate) => candidate.agents.includes("*"));
  const rules = chosen.flatMap((candidate) => candidate.rules);
  return {
    sitemaps,
    allowed(path: string) {
      const target = path.startsWith("/") ? path : `/${path}`;
      let matched = "";
      let allow = true;
      for (const rule of rules) {
        if (!ruleMatches(rule.path, target)) continue;
        if (
          rule.path.length > matched.length ||
          (rule.path.length === matched.length && rule.allow)
        ) {
          matched = rule.path;
          allow = rule.allow;
        }
      }
      return allow;
    }
  };
}

export function allowAll(): RobotsRules {
  return { sitemaps: [], allowed: () => true };
}

/** Gzip magic, a `.gz` URL, or a gzip content type. Other bodies are returned as-is. */
export function maybeGunzip(url: string, contentType: string, body: Uint8Array): Uint8Array {
  const type = contentType.toLowerCase();
  const name = url.toLowerCase().split("?")[0] ?? "";
  const hinted = type.includes("gzip") || name.endsWith(".gz");
  const magic = body.byteLength >= 2 && body[0] === 0x1f && body[1] === 0x8b;
  if (!hinted && !magic) return body;
  try {
    return gunzipSync(body, { maxOutputLength: MAX_SITEMAP_BYTES });
  } catch {
    return body;
  }
}

export function isAssetPath(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last.includes(".");
}

/**
 * Same-origin page paths from an explicit import list.
 * Empty input means "no list". A list with nothing on this origin throws.
 */
export function pagePathsFromList(
  urls: readonly string[] | undefined,
  origin: URL
): string[] | null {
  if (!urls || urls.length === 0) return null;
  const pages: string[] = [];
  const seen = new Set<string>();
  for (const entry of urls) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const path = normalizeSitePath(trimmed, origin);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    pages.push(path);
  }
  if (pages.length === 0) throw new Error("The URL list has no pages on this site.");
  return pages;
}

const TEXT = new TextDecoder();

/**
 * Pages from sitemap indexes and urlsets. Follows nested sitemaps, gunzips
 * `.gz` bodies, and keeps same-origin URLs `allow` accepts. `sitemapUrls`
 * are the robots.txt Sitemap lines plus `/sitemap.xml`.
 */
export async function collectSitemapPages(input: {
  fetchPage: PageFetch;
  origin: URL;
  sitemapUrls: readonly string[];
  allow: (path: string) => boolean;
  maxPages: number;
  pace?: () => Promise<void>;
}): Promise<string[]> {
  const queue: string[] = [];
  const seenDocs = new Set<string>();
  for (const entry of input.sitemapUrls) {
    const resolved = resolveSitemap(entry, input.origin);
    if (!resolved || seenDocs.has(resolved)) continue;
    seenDocs.add(resolved);
    queue.push(resolved);
  }
  const pages: string[] = [];
  const seenPages = new Set<string>();
  let docs = 0;
  while (queue.length > 0 && pages.length < input.maxPages && docs < MAX_SITEMAP_DOCS) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl) break;
    docs += 1;
    await input.pace?.();
    const response = await input.fetchPage(sitemapUrl);
    if (!response || response.status >= 400 || response.body.byteLength === 0) continue;
    const xml = TEXT.decode(maybeGunzip(sitemapUrl, response.contentType, response.body));
    if (!/<loc[\s>]/i.test(xml)) continue;
    const locs = sitemapLocs(xml);
    if (sitemapKind(xml) === "index") {
      for (const loc of locs) {
        const child = resolveSitemap(decodeXml(loc), sitemapUrl);
        if (!child || seenDocs.has(child)) continue;
        seenDocs.add(child);
        queue.push(child);
      }
      continue;
    }
    for (const loc of locs) {
      if (pages.length >= input.maxPages) break;
      let resolved: URL;
      try {
        resolved = new URL(loc, sitemapUrl);
      } catch {
        continue;
      }
      if (resolved.origin !== input.origin.origin) continue;
      const path = normalizeSitePath(resolved.pathname, input.origin);
      if (!path || seenPages.has(path) || !input.allow(path)) continue;
      seenPages.add(path);
      pages.push(path);
    }
  }
  return pages;
}

function resolveSitemap(value: string, base: URL | string): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const origin = typeof base === "string" ? new URL(base).origin : base.origin;
    if (url.origin !== origin) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
