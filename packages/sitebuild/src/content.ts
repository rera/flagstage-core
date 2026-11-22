import { sha256 } from "./manifest";

/**
 * Visible text, links, and images for one HTML page.
 * The hash is of that inventory, so a current-page class does not change it.
 */
export interface PageInventory {
  text: string[];
  links: string[];
  images: string[];
  sha256: string;
}

export interface BaselinePage extends PageInventory {
  path: string;
}

export interface BaselineCovered {
  path: string;
  /** A generated listing replaced the crawled page, or a 301 covers its URL. */
  by: "listing" | "redirect";
  to?: string;
}

export interface Baseline {
  version: 1;
  pages: BaselinePage[];
  covered: BaselineCovered[];
}

export const BASELINE_PATH = ".flagstage/baseline.json";

const STATE_CLASS = new Set(["active", "current", "selected", "is-active", "is-current", "open"]);
const RAW = new Set(["script", "style", "textarea", "noscript"]);
const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "caption",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "title",
  "tr",
  "ul"
]);
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

interface TagInfo {
  name: string;
  closing: boolean;
  selfClosing: boolean;
}

/**
 * Drop current-page markers by splicing them out of the tag they sit on.
 * The rest of the document is left as it was. This is not a parse-and-serialize:
 * attribute order, quotes, and every other byte stay put.
 */
export function normalizeNav(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const stop = end < 0 ? html.length : end + 3;
      out += html.slice(lt, stop);
      i = stop;
      continue;
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt < 0) {
      out += html.slice(lt);
      break;
    }
    const raw = html.slice(lt, gt + 1);
    out += normalizeTag(raw);
    const info = tagInfo(raw);
    if (info && !info.closing && !info.selfClosing && RAW.has(info.name)) {
      const closeAt = findClose(html, gt + 1, info.name);
      const stop = closeAt ?? html.length;
      out += html.slice(gt + 1, stop);
      i = stop;
      continue;
    }
    i = gt + 1;
  }
  return out;
}

export function inventoryHtml(html: string): PageInventory {
  // Current-page markers live in tag attributes. Text, href, and src are read
  // from the original bytes, so those markers never enter the inventory.
  const source = html;
  const text: string[] = [];
  const links: string[] = [];
  const images: string[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    const value = decode(buf).replace(/\s+/g, " ").trim();
    buf = "";
    if (value) text.push(value);
  };

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt < 0) {
      buf += source.slice(i);
      break;
    }
    buf += source.slice(i, lt);
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      i = end < 0 ? source.length : end + 3;
      continue;
    }
    const gt = source.indexOf(">", lt + 1);
    if (gt < 0) {
      buf += source.slice(lt);
      break;
    }
    const raw = source.slice(lt, gt + 1);
    const info = tagInfo(raw);
    if (!info) {
      buf += raw;
      i = gt + 1;
      continue;
    }
    if (!info.closing && RAW.has(info.name) && !info.selfClosing) {
      flush();
      const closeAt = findClose(source, gt + 1, info.name);
      i = closeAt ?? source.length;
      continue;
    }
    if (BLOCK.has(info.name)) flush();
    if (!info.closing && info.name === "a") {
      const href = attr(raw, "href");
      if (href) links.push(decode(href).trim());
    } else if (!info.closing && info.name === "img") {
      const src = attr(raw, "src");
      if (src) images.push(decode(src).trim());
    }
    i = gt + 1;
  }
  flush();
  return { text, links, images, sha256: inventoryHash({ text, links, images }) };
}

export function inventoryHash(inventory: Pick<PageInventory, "text" | "links" | "images">): string {
  return sha256(
    `${inventory.text.join("\n")}\0${inventory.links.join("\n")}\0${inventory.images.join("\n")}`
  );
}

/** HTML pages a visitor can open. Includes, templates, and `.flagstage` are not. */
export function isContentPage(path: string): boolean {
  const file = path.split("?")[0] ?? path;
  if (!file || file.startsWith("/")) return false;
  const parts = file.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  if (parts[0] === "_inc" || parts[0] === "_templates" || parts[0] === ".flagstage") return false;
  const lower = file.toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm");
}

export function inventoryPages(pages: Array<{ path: string; html: string }>): BaselinePage[] {
  const out: BaselinePage[] = [];
  for (const page of pages) {
    if (!isContentPage(page.path)) continue;
    out.push({ path: page.path, ...inventoryHtml(page.html) });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/**
 * Pages the build is allowed to replace. A crawled listing that the build
 * regenerates, and a pagination URL that becomes a 301, are covered.
 * Anything else that disappears is lost.
 */
export function coverBaseline(
  pages: BaselinePage[],
  removedPaths: string[],
  redirects: Array<{ fromPath: string; toPath: string }>
): Baseline {
  const removed = new Set(removedPaths);
  const covered: BaselineCovered[] = [];
  for (const page of pages) {
    if (!removed.has(page.path)) continue;
    const url = pageUrl(page.path);
    const redirect = redirects.find(
      (item) => urlsMatch(item.fromPath, url) || urlsMatch(item.fromPath, `/${page.path}`)
    );
    if (redirect) covered.push({ path: page.path, by: "redirect", to: redirect.toPath });
    else covered.push({ path: page.path, by: "listing" });
  }
  covered.sort((a, b) => a.path.localeCompare(b.path));
  return { version: 1, pages, covered };
}

/**
 * True for a public file a listing group will write. The build replaces the
 * crawled page at that path, so the crawled text is not a loss.
 */
export function listingMatcher(listingsJson: string | null | undefined): (rel: string) => boolean {
  if (!listingsJson) return () => false;
  let groups: Array<{ output?: unknown; landing?: unknown }> = [];
  try {
    const parsed = JSON.parse(listingsJson) as {
      groups?: Array<{ output?: unknown; landing?: unknown }>;
    };
    groups = parsed.groups ?? [];
  } catch {
    return () => false;
  }
  const landings = new Set<string>();
  const patterns: RegExp[] = [];
  for (const group of groups) {
    if (typeof group.landing === "string") landings.add(landingFile(group.landing));
    if (typeof group.output === "string") patterns.push(outputPattern(group.output));
  }
  return (rel: string) => landings.has(rel) || patterns.some((pattern) => pattern.test(rel));
}

function landingFile(landing: string): string {
  const path = (landing.split("?")[0] ?? "").replace(/^\/+/, "");
  if (path === "" || path === "index.html") return "index.html";
  if (path.endsWith("index.html")) return path;
  if (path.endsWith("/")) return `${path}index.html`;
  return path.endsWith(".html") || path.endsWith(".htm") ? path : `${path}/index.html`;
}

function outputPattern(output: string): RegExp {
  const rel = output.replace(/^\/+/, "");
  const body = rel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{n\\\}/g, "\\d+")
    .replace(/\\\{section\\\}/g, "[^/]+")
    .replace(/\\\{tag\\\}/g, "[^/]+");
  return new RegExp(`^${body}$`, "i");
}

export function serializeBaseline(baseline: Baseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

export function parseBaseline(raw: string): Baseline | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Baseline>;
    if (parsed.version !== 1 || !Array.isArray(parsed.pages)) return null;
    const pages: BaselinePage[] = [];
    for (const page of parsed.pages) {
      if (!page || typeof page.path !== "string" || !Array.isArray(page.text)) return null;
      if (!Array.isArray(page.links) || !Array.isArray(page.images)) return null;
      if (typeof page.sha256 !== "string") return null;
      if (!page.text.every((item) => typeof item === "string")) return null;
      if (!page.links.every((item) => typeof item === "string")) return null;
      if (!page.images.every((item) => typeof item === "string")) return null;
      pages.push(page);
    }
    const covered: BaselineCovered[] = [];
    for (const item of parsed.covered ?? []) {
      if (!item || typeof item.path !== "string") return null;
      if (item.by !== "listing" && item.by !== "redirect") return null;
      covered.push({
        path: item.path,
        by: item.by,
        ...(typeof item.to === "string" ? { to: item.to } : {})
      });
    }
    return { version: 1, pages, covered };
  } catch {
    return null;
  }
}

export function pageUrl(path: string): string {
  const queryAt = path.indexOf("?");
  const file = queryAt >= 0 ? path.slice(0, queryAt) : path;
  const query = queryAt >= 0 ? path.slice(queryAt) : "";
  let base: string;
  if (file === "index.html" || file === "") base = "/";
  else if (file.endsWith("/index.html")) base = `/${file.slice(0, -"index.html".length)}`;
  else base = `/${file.replace(/^\/+/, "")}`;
  return `${base}${query}`;
}

export function urlsMatch(a: string, b: string): boolean {
  const norm = (value: string) => {
    const [path, query] = value.split("?");
    const trimmed = (path ?? "").replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/";
    return query ? `${trimmed}?${query}` : trimmed;
  };
  return norm(a) === norm(b);
}

/** Items in `expected` that `actual` has fewer of. Order is kept. */
export function subtract(expected: string[], actual: string[]): string[] {
  const counts = new Map<string, number>();
  for (const item of actual) counts.set(item, (counts.get(item) ?? 0) + 1);
  const missing: string[] = [];
  for (const item of expected) {
    const have = counts.get(item) ?? 0;
    if (have > 0) counts.set(item, have - 1);
    else missing.push(item);
  }
  return missing;
}

export function clip(value: string, max = 180): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 3)}...`;
}

function normalizeTag(tag: string): string {
  if (!tag.startsWith("<") || tag.startsWith("</") || tag.startsWith("<!")) return tag;
  let next = tag.replace(/\s+aria-current\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi, "");
  next = next.replace(
    /\s+class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i,
    (
      full,
      doubleQuoted: string | undefined,
      singleQuoted: string | undefined,
      bare: string | undefined
    ) => {
      const value = doubleQuoted ?? singleQuoted ?? bare ?? "";
      const tokens = value.split(/\s+/).filter(Boolean);
      const kept = tokens.filter((token) => !STATE_CLASS.has(token));
      if (kept.length === tokens.length) return full;
      if (kept.length === 0) return "";
      const joined = kept.join(" ");
      if (doubleQuoted !== undefined) return ` class="${joined}"`;
      if (singleQuoted !== undefined) return ` class='${joined}'`;
      return ` class=${joined}`;
    }
  );
  return next;
}

function tagInfo(tag: string): TagInfo | null {
  const match = /^<\s*(\/)?\s*([A-Za-z][-A-Za-z0-9]*)/.exec(tag);
  const name = match?.[2]?.toLowerCase();
  if (!name) return null;
  const closing = Boolean(match?.[1]);
  return { name, closing, selfClosing: !closing && (tag.endsWith("/>") || VOID.has(name)) };
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i");
  const match = re.exec(tag);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

/** Index of the closing tag, including the tag, or null. */
export function findClose(html: string, from: number, name: string): number | null {
  let depth = 1;
  let i = from;
  const lower = name.toLowerCase();
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) return null;
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt < 0) return null;
    const info = tagInfo(html.slice(lt, gt + 1));
    if (info && info.name === lower && !info.selfClosing) {
      if (info.closing) {
        depth -= 1;
        if (depth === 0) return gt + 1;
      } else depth += 1;
    }
    i = gt + 1;
  }
  return null;
}

function decode(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
