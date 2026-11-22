import { createHash } from "node:crypto";

import type { CapturedFile, ImportResult } from "./types";

/**
 * After shared blocks are extracted, group pages by structure and write the
 * files an editing agent needs. No model is called.
 *
 * A page type is a structural skeleton shared by at least two pages. Text,
 * class names, and the current-page marker are ignored, and a repeated list
 * of the same child counts as one shape, so a short list and a long list of
 * the same card are one type. Article, listing, and generic page are the only
 * names. When two shapes would share a name, only the larger one is templated.
 *
 * `_templates/<type>.html` is one example of that type: include directives
 * stay, the current-page marker becomes `{{path}}`, repeated listing items
 * collapse to one, and the remaining text becomes placeholders. The site skill
 * and the drift manifest live under `.flagstage/`. Publish omits all three.
 *
 * The drift manifest records each include's bytes and the pages that link it.
 * A later publish check compares that record. This step only writes it.
 */

const MIN_CLUSTER = 2;

export const SITE_SKILL_PATH = ".flagstage/skills/site/SKILL.md";
export const DRIFT_MANIFEST_PATH = ".flagstage/drift.json";

export interface DriftPlacement {
  page: string;
  /** Set when the directive wrote `active`, including an empty value. */
  active?: string;
}

export interface DriftInclude {
  /** Site-root path, such as `/_inc/header.html`. */
  virtual: string;
  /** sha256 of the include file bytes at import. */
  sha256: string;
  /**
   * sha256 of the placement lines, in order. Each line is the page path, a
   * tab, and the active value (empty when the directive has no `active`).
   */
  placementSha256: string;
  placements: DriftPlacement[];
}

export interface DriftManifest {
  version: 1;
  includes: DriftInclude[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

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
const RAW = new Set(["script", "style", "textarea", "title"]);
const CHROME = new Set(["header", "nav", "footer"]);

interface Span {
  start: number;
  end: number;
}

interface Attr {
  name: string;
  value: string;
  valueStart: number;
  valueEnd: number;
}

interface Tag {
  kind: "open" | "close" | "comment" | "other";
  name: string;
  start: number;
  end: number;
  attrs: Attr[];
  selfClosing: boolean;
}

interface Node {
  tag: string;
  start: number;
  end: number;
  children: Node[];
  texts: Span[];
  rawText?: Span;
  href?: Span;
}

interface PageInfo {
  path: string;
  html: string;
  kind: "article" | "listing" | "page";
  skeleton: string;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

export function scaffoldSite(result: ImportResult): ImportResult {
  const decoded: PageInfo[] = [];
  let parsedCount = 0;
  for (const file of result.pages) {
    if (!isSourcePage(file)) continue;
    parsedCount += 1;
    let html: string;
    try {
      html = decoder.decode(file.body);
    } catch {
      continue;
    }
    const info = describePage(file.path, html);
    if (info) decoded.push(info);
  }

  const chosen = chooseTypes(decoded);
  const templates = [...chosen.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, pages]) => {
      const example = [...pages].sort((a, b) => a.path.localeCompare(b.path))[0];
      if (!example) return null;
      return captured(
        `_templates/${kind}.html`,
        templateFrom(example.html, kind),
        "text/html; charset=utf-8"
      );
    })
    .filter((file): file is CapturedFile => file !== null);

  const includes = result.pages
    .filter(
      (file) => file.path.startsWith("_inc/") && !file.path.slice("_inc/".length).includes("/")
    )
    .sort((a, b) => a.path.localeCompare(b.path));
  const skill = renderSkill(includes, chosen, parsedCount);
  const manifest = renderManifest(decoded, includes);
  const added = [
    captured(DRIFT_MANIFEST_PATH, manifest, "application/json"),
    captured(SITE_SKILL_PATH, skill, "text/markdown; charset=utf-8"),
    ...templates
  ].sort((a, b) => a.path.localeCompare(b.path));
  const managed = new Set(added.map((file) => file.path));
  const pages = result.pages.filter((file) => !managed.has(file.path));
  return { ...result, pages: [...pages, ...added] };
}

function describePage(path: string, html: string): PageInfo | null {
  const root = parseDocument(html);
  const body = findFirst(root, "body") ?? root;
  const content = contentRoot(body);
  return { path, html, kind: kindOf(content), skeleton: signature(content) };
}

function chooseTypes(pages: PageInfo[]): Map<PageInfo["kind"], PageInfo[]> {
  const groups = new Map<string, PageInfo[]>();
  for (const page of pages) {
    const key = `${page.kind}\0${page.skeleton}`;
    const list = groups.get(key);
    if (list) list.push(page);
    else groups.set(key, [page]);
  }
  const best = new Map<PageInfo["kind"], { skeleton: string; pages: PageInfo[] }>();
  for (const [key, list] of groups) {
    if (list.length < MIN_CLUSTER) continue;
    const kind = key.slice(0, key.indexOf("\0"));
    if (!isKind(kind)) continue;
    const skeleton = key.slice(kind.length + 1);
    const current = best.get(kind);
    const replace =
      !current ||
      list.length > current.pages.length ||
      (list.length === current.pages.length && skeleton < current.skeleton);
    if (replace) best.set(kind, { skeleton, pages: list });
  }
  const chosen = new Map<PageInfo["kind"], PageInfo[]>();
  for (const [kind, info] of best) chosen.set(kind, info.pages);
  return chosen;
}

function isKind(value: string): value is PageInfo["kind"] {
  return value === "article" || value === "listing" || value === "page";
}

function kindOf(content: Node): PageInfo["kind"] {
  if (hasListing(content, false)) return "listing";
  const articles: Node[] = [];
  collectArticles(content, articles);
  const article = articles[0];
  if (articles.length === 1 && article && hasHeading(article)) return "article";
  return "page";
}

function hasListing(node: Node, inArticle: boolean): boolean {
  if (CHROME.has(node.tag)) return false;
  if (!inArticle && linkedRun(node)) return true;
  const next = inArticle || node.tag === "article";
  return node.children.some((child) => hasListing(child, next));
}

function linkedRun(node: Node): boolean {
  const kids = node.children;
  let index = 0;
  while (index < kids.length) {
    const child = kids[index];
    if (!child) break;
    const sig = signature(child);
    let next = index + 1;
    while (next < kids.length && sameSignature(kids[next], sig)) next += 1;
    if (
      next - index >= 2 &&
      kids.slice(index, next).every((item) => item && containsAnchor(item))
    ) {
      return true;
    }
    index = next;
  }
  return false;
}

function collectArticles(node: Node, out: Node[]): void {
  if (node.tag === "article") {
    out.push(node);
    return;
  }
  for (const child of node.children) collectArticles(child, out);
}

function hasHeading(node: Node): boolean {
  if (isHeading(node.tag)) return true;
  return node.children.some((child) => hasHeading(child));
}

function containsAnchor(node: Node): boolean {
  if (node.tag === "a") return true;
  return node.children.some((child) => containsAnchor(child));
}

function contentRoot(body: Node): Node {
  const main = findFirst(body, "main");
  if (main) return main;
  return {
    tag: "body",
    start: body.start,
    end: body.end,
    children: body.children.filter((child) => !CHROME.has(child.tag)),
    texts: []
  };
}

function signature(node: Node): string {
  const parts: string[] = [];
  let index = 0;
  while (index < node.children.length) {
    const child = node.children[index];
    if (!child) break;
    const sig = signature(child);
    let next = index + 1;
    while (next < node.children.length && sameSignature(node.children[next], sig)) {
      next += 1;
    }
    parts.push(next - index >= 2 ? `${sig}+` : sig);
    index = next;
  }
  return `${node.tag}[${parts.join(",")}]`;
}

function templateFrom(html: string, kind: PageInfo["kind"]): string {
  const neutralized = neutralizeActive(html);
  const collapsed = kind === "listing" ? collapseRuns(neutralized) : neutralized;
  return placeholder(collapsed);
}

function neutralizeActive(html: string): string {
  return html.replace(/<!--#include\b[\s\S]*?-->/gi, (directive) => {
    if (!/\bactive\s*=/.test(directive)) return directive;
    return directive.replace(
      /\bactive\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/i,
      'active="{{path}}"'
    );
  });
}

function sameSignature(node: Node | undefined, sig: string): boolean {
  return node !== undefined && signature(node) === sig;
}

function collapseRuns(html: string): string {
  const root = parseDocument(html);
  const content = contentRoot(findFirst(root, "body") ?? root);
  const ranges: Span[] = [];
  collectCollapse(content, false, ranges);
  if (ranges.length === 0) return html;
  ranges.sort((a, b) => b.start - a.start);
  let out = html;
  for (const range of ranges) {
    if (range.start < 0 || range.end > out.length || range.start > range.end) continue;
    out = out.slice(0, range.start) + out.slice(range.end);
  }
  return out;
}

function collectCollapse(node: Node, inArticle: boolean, ranges: Span[]): void {
  if (CHROME.has(node.tag)) return;
  const skip = new Set<Node>();
  if (!inArticle) {
    let index = 0;
    while (index < node.children.length) {
      const child = node.children[index];
      if (!child) break;
      const sig = signature(child);
      let next = index + 1;
      while (next < node.children.length && sameSignature(node.children[next], sig)) {
        next += 1;
      }
      const run = node.children.slice(index, next);
      const last = run[run.length - 1];
      if (
        run.length >= 2 &&
        last &&
        child.end > child.start &&
        last.end > child.end &&
        run.every((item) => containsAnchor(item))
      ) {
        ranges.push({ start: child.end, end: last.end });
        for (const item of run.slice(1)) skip.add(item);
      }
      index = next;
    }
  }
  const deeper = inArticle || node.tag === "article";
  for (const child of node.children) {
    if (skip.has(child)) continue;
    collectCollapse(child, deeper, ranges);
  }
}

function placeholder(html: string): string {
  const root = parseDocument(html);
  const edits: Edit[] = [];
  const heading = { seen: false };
  walk(root, false, null, heading, html, edits);
  edits.sort((a, b) => b.start - a.start);
  let out = html;
  for (const edit of edits) {
    if (edit.start < 0 || edit.end > out.length || edit.start > edit.end) continue;
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

function walk(
  node: Node,
  chrome: boolean,
  forced: string | null,
  heading: { seen: boolean },
  html: string,
  edits: Edit[]
): void {
  if (node.tag === "script" || node.tag === "style") return;
  const nextChrome = chrome || CHROME.has(node.tag);
  let token = forced;
  let childToken = forced;
  if (!forced) {
    if (node.tag === "title") token = "{{title}}";
    else if (!nextChrome && isHeading(node.tag)) {
      token = heading.seen ? "{{heading}}" : "{{title}}";
      heading.seen = true;
      childToken = token;
    } else if (!nextChrome) token = "{{text}}";
  }
  if (token && (!nextChrome || node.tag === "title")) {
    for (const span of node.texts) pushText(edits, html, span, token);
    if (node.rawText) pushText(edits, html, node.rawText, token);
  }
  if (!nextChrome && node.href)
    edits.push({ start: node.href.start, end: node.href.end, text: "{{url}}" });
  for (const child of node.children) walk(child, nextChrome, childToken, heading, html, edits);
}

function pushText(edits: Edit[], html: string, span: Span, token: string): void {
  if (html.slice(span.start, span.end).trim() === "") return;
  edits.push({ start: span.start, end: span.end, text: token });
}

function renderSkill(
  includes: CapturedFile[],
  chosen: Map<PageInfo["kind"], PageInfo[]>,
  parsedCount: number
): string {
  const includeLines =
    includes.length === 0
      ? "No shared include was extracted.\n"
      : includes
          .map((file) => describeInclude(file))
          .join("\n")
          .concat("\n");
  const kinds = [...chosen.keys()].sort();
  let covered = 0;
  const typeLines = kinds.map((kind) => {
    const pages = chosen.get(kind) ?? [];
    covered += pages.length;
    const sample = [...pages].sort((a, b) => a.path.localeCompare(b.path))[0];
    const samplePath = sample ? `, including \`${sample.path}\`` : "";
    return `- \`${kind}\` — template \`_templates/${kind}.html\`. ${pages.length} pages${samplePath}. A new ${kind} starts from that template.`;
  });
  const types =
    typeLines.length === 0
      ? "No page type was shared by enough pages to template. Copy the closest existing page when adding one.\n"
      : `${typeLines.join("\n")}\n`;
  const left = parsedCount - covered;
  const remainder =
    typeLines.length > 0 && left > 0
      ? `\n${left} pages did not match these templates. Leave them as they are.\n`
      : "";
  return `---
name: site
description: "Use for every edit on this site. It lists includes, page types, and the rule for site-wide changes."
---

# Site

Shared parts of this site are files. The published site does not show them.

## Includes

Each include is pulled in with an include directive. Edit the include to change every page that uses it.

${includeLines}
## Page types

A new page of a type starts from that type's template. Replace \`{{title}}\`, \`{{heading}}\`, \`{{text}}\`, and \`{{url}}\`. Set \`active="{{path}}"\` to the new page's path.

${types}${remainder}
## Site-wide changes

A site-wide change must be done by writing a script and doing a dry run before applying. The dry run shows the count of matching pages and a sample diff. Apply the script only after that dry run. Never hand-edit many files.
`;
}

function describeInclude(file: CapturedFile): string {
  let html = "";
  try {
    html = decoder.decode(file.body);
  } catch {
    html = "";
  }
  const links: string[] = [];
  const hrefs = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const match of html.matchAll(hrefs)) {
    const href = match[1] ?? match[2] ?? match[3];
    if (href && !links.includes(href)) links.push(href);
  }
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const excerpt = text.length > 140 ? `${text.slice(0, 137)}...` : text;
  const sentence = excerpt.endsWith(".") || excerpt.endsWith("...") ? excerpt : `${excerpt}.`;
  const held = excerpt ? `Holds: ${sentence}` : "Holds no text.";
  const linkText = links.length > 0 ? ` Links: ${links.join(", ")}.` : "";
  return `- \`/${file.path}\` — ${roleOf(file.path)}. ${held}${linkText}`;
}

function roleOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.html?$/i, "");
  if (base === "header" || base.startsWith("header-")) return "site header";
  if (base === "footer" || base.startsWith("footer-")) return "site footer";
  if (base === "nav" || base.startsWith("nav-")) return "navigation";
  if (base.startsWith("head-")) return "document head";
  return base.replace(/-/g, " ");
}

function renderManifest(pages: PageInfo[], includes: CapturedFile[]): string {
  const byVirtual = new Map<string, CapturedFile>();
  for (const file of includes) byVirtual.set(`/${file.path}`, file);
  const placements = new Map<string, Array<DriftPlacement & { index: number }>>();
  for (const page of pages) {
    let index = 0;
    for (const directive of page.html.matchAll(/<!--#include\b([\s\S]*?)-->/gi)) {
      const raw = directive[1] ?? "";
      const virtual = attr(raw, "virtual");
      if (!virtual || !virtual.startsWith("/_inc/")) continue;
      const active = attr(raw, "active");
      const list = placements.get(virtual) ?? [];
      const entry: DriftPlacement & { index: number } = { page: page.path, index };
      if (active !== undefined) entry.active = active;
      list.push(entry);
      placements.set(virtual, list);
      index += 1;
    }
  }
  const virtuals = [...new Set([...byVirtual.keys(), ...placements.keys()])].sort();
  const manifest: DriftManifest = {
    version: 1,
    includes: virtuals.map((virtual) => {
      const file = byVirtual.get(virtual);
      const list = (placements.get(virtual) ?? [])
        .sort((a, b) => a.page.localeCompare(b.page) || a.index - b.index)
        .map((item) =>
          item.active === undefined ? { page: item.page } : { page: item.page, active: item.active }
        );
      return {
        virtual,
        sha256: file ? sha256(file.body) : "",
        placementSha256: placementHash(list),
        placements: list
      };
    })
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function placementHash(placements: DriftPlacement[]): string {
  const lines = placements.map((item) => `${item.page}\t${item.active ?? ""}`).join("\n");
  return sha256(encoder.encode(lines));
}

function attr(raw: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i").exec(
    raw
  );
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function sha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function captured(path: string, text: string, contentType: string): CapturedFile {
  return { path, body: encoder.encode(text), contentType };
}

function isSourcePage(file: CapturedFile): boolean {
  const parts = file.path.split("/");
  if (parts.includes("_inc") || parts.includes("_templates") || parts.includes(".flagstage")) {
    return false;
  }
  if (file.contentType.toLowerCase().includes("html")) return true;
  return file.path.endsWith(".html") || file.path.endsWith(".htm");
}

function isHeading(tag: string): boolean {
  return (
    tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6"
  );
}

function findFirst(node: Node, tag: string): Node | null {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = findFirst(child, tag);
    if (found) return found;
  }
  return null;
}

function parseDocument(html: string): Node {
  const root = makeNode("#document", 0);
  const stack: Node[] = [root];
  let index = 0;
  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt < 0) {
      addText(stack[stack.length - 1], index, html.length);
      break;
    }
    if (lt > index) addText(stack[stack.length - 1], index, lt);
    const tag = readTag(html, lt);
    if (!tag || tag.end <= lt) {
      addText(stack[stack.length - 1], lt, lt + 1);
      index = lt + 1;
      continue;
    }
    if (tag.kind === "comment" || tag.kind === "other") {
      index = tag.end;
      continue;
    }
    if (tag.kind === "close") {
      let found = -1;
      for (let slot = stack.length - 1; slot > 0; slot -= 1) {
        if (stack[slot]?.tag === tag.name) {
          found = slot;
          break;
        }
      }
      if (found > 0) {
        while (stack.length - 1 > found) {
          const open = stack.pop();
          if (open) open.end = lt;
        }
        const open = stack.pop();
        if (open) open.end = tag.end;
      }
      index = tag.end;
      continue;
    }
    const child = makeNode(tag.name, lt);
    child.end = tag.end;
    const href = tag.attrs.find((item) => item.name === "href");
    if (tag.name === "a" && href && href.valueEnd >= href.valueStart) {
      child.href = { start: href.valueStart, end: href.valueEnd };
    }
    stack[stack.length - 1]?.children.push(child);
    if (tag.selfClosing || VOID.has(tag.name)) {
      index = tag.end;
      continue;
    }
    stack.push(child);
    if (RAW.has(tag.name)) {
      const close = findClose(html, tag.end, tag.name, html.length);
      child.rawText = { start: tag.end, end: close ? close.contentEnd : html.length };
      child.end = close ? close.end : html.length;
      stack.pop();
      index = child.end;
      continue;
    }
    index = tag.end;
  }
  root.end = html.length;
  return root;
}

function makeNode(tag: string, start: number): Node {
  return { tag, start, end: start, children: [], texts: [] };
}

function addText(node: Node | undefined, start: number, end: number): void {
  if (!node || end <= start) return;
  node.texts.push({ start, end });
}

function findClose(
  html: string,
  from: number,
  name: string,
  limit: number
): { contentEnd: number; end: number } | null {
  const last = Math.min(limit, html.length);
  for (let index = from; index < last; index += 1) {
    if (html[index] !== "<" || html[index + 1] !== "/") continue;
    let cursor = index + 2;
    let matched = 0;
    while (matched < name.length && cursor < last) {
      const char = html[cursor] ?? "";
      const folded =
        char >= "A" && char <= "Z" ? String.fromCharCode(char.charCodeAt(0) + 32) : char;
      if (folded !== name[matched]) break;
      cursor += 1;
      matched += 1;
    }
    if (matched !== name.length) continue;
    while (cursor < last && isSpace(html[cursor] ?? "")) cursor += 1;
    if (html[cursor] === ">") return { contentEnd: index, end: cursor + 1 };
  }
  return null;
}

function readTag(html: string, start: number): Tag | null {
  if (html[start] !== "<") return null;
  if (html.startsWith("<!--", start)) {
    const end = html.indexOf("-->", start + 4);
    return {
      kind: "comment",
      name: "",
      start,
      end: end < 0 ? html.length : end + 3,
      attrs: [],
      selfClosing: false
    };
  }
  const second = html[start + 1];
  if (second === "!" || second === "?") {
    const end = html.indexOf(">", start + 2);
    return {
      kind: "other",
      name: "",
      start,
      end: end < 0 ? html.length : end + 1,
      attrs: [],
      selfClosing: false
    };
  }
  const closing = second === "/";
  let index = start + (closing ? 2 : 1);
  if (!isNameStart(html[index] ?? "")) return null;
  const nameStart = index;
  index += 1;
  while (isNameChar(html[index] ?? "")) index += 1;
  const name = html.slice(nameStart, index).toLowerCase();
  const attrs: Attr[] = [];
  while (index < html.length) {
    while (isSpace(html[index] ?? "")) index += 1;
    const char = html[index];
    if (char === undefined) break;
    if (char === ">") {
      return {
        kind: closing ? "close" : "open",
        name,
        start,
        end: index + 1,
        attrs,
        selfClosing: false
      };
    }
    if (char === "/" && html[index + 1] === ">") {
      return { kind: "open", name, start, end: index + 2, attrs, selfClosing: true };
    }
    if (!isAttrName(char)) {
      const end = html.indexOf(">", index);
      return {
        kind: closing ? "close" : "open",
        name,
        start,
        end: end < 0 ? html.length : end + 1,
        attrs,
        selfClosing: false
      };
    }
    const attrAt = index;
    while (isAttrName(html[index] ?? "")) index += 1;
    const attrName = html.slice(attrAt, index).toLowerCase();
    while (isSpace(html[index] ?? "")) index += 1;
    let value = "";
    let valueStart = index;
    let valueEnd = index;
    if (html[index] === "=") {
      index += 1;
      while (isSpace(html[index] ?? "")) index += 1;
      const quote = html[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        valueStart = index;
        const endQuote = html.indexOf(quote, index);
        if (endQuote < 0) {
          value = html.slice(valueStart);
          index = html.length;
          valueEnd = index;
        } else {
          value = html.slice(valueStart, endQuote);
          valueEnd = endQuote;
          index = endQuote + 1;
        }
      } else {
        valueStart = index;
        while (index < html.length && !isSpace(html[index] ?? "") && html[index] !== ">")
          index += 1;
        value = html.slice(valueStart, index);
        valueEnd = index;
      }
    }
    attrs.push({ name: attrName, value, valueStart, valueEnd });
  }
  return { kind: closing ? "close" : "open", name, start, end: index, attrs, selfClosing: false };
}

function isSpace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f";
}

function isNameStart(char: string): boolean {
  return (char >= "A" && char <= "Z") || (char >= "a" && char <= "z");
}

function isNameChar(char: string): boolean {
  return (
    isNameStart(char) ||
    (char >= "0" && char <= "9") ||
    char === "-" ||
    char === ":" ||
    char === "_"
  );
}

function isAttrName(char: string): boolean {
  return (
    char !== "" && !isSpace(char) && char !== "=" && char !== ">" && char !== "/" && char !== "<"
  );
}
