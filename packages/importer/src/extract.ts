import type { CapturedFile, FidelityItem, FidelityReport, ImportResult } from "./types";

/**
 * Pulls exact shared blocks out of imported pages and into `/_inc/`.
 *
 * Runs after every importer. Detection is deterministic: fingerprint each
 * top-level block, strip current-page nav markers, and extract a block only
 * when that normalized string is byte-for-byte the same on more than half
 * the pages. The page is edited by splicing the original span with an include
 * directive. The rest of the document is not parsed back into HTML.
 *
 * Near-duplicates and drifted copies stay inline and are added to
 * `report.uncertain`. A miss is a missed include. The page still builds.
 *
 * `active` on the directive is the href that carried the current-page marker.
 * `@flagstage/sitebuild` puts `class="active" aria-current="page"` back on
 * the first `<a href="...">` in that form. Other marker spellings are removed
 * so the copies match, and sitebuild does not restore those spellings.
 */

const MAX_DEPTH = 3;
const MIN_TEXT = 20;
const MIN_LINKS = 3;
/** Token overlap from the shared-region experiment. At or above this, a copy is near-duplicate rather than a different block. */
const SIMILAR = 0.6;

const STATE_CLASS = new Set(["active", "current", "selected", "is-active", "is-current", "open"]);
const CURRENT_CLASS = new Set(["active", "current", "selected", "is-active", "is-current"]);
const CHROME_TAG = new Set(["header", "footer", "nav", "aside"]);
const CHROME_CLASS = /alert|banner|cookie|newsletter|sidebar/i;
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

interface Attr {
  name: string;
  value: string;
  quote: '"' | "'" | "";
  start: number;
  end: number;
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
  classFirst: string;
  parent: number;
  closed: boolean;
  links: number;
  textLen: number;
  parts: string[];
}

interface Region {
  page: number;
  path: string;
  start: number;
  end: number;
  slot: string;
  exact: string;
  active?: string;
  tag: string;
  classFirst: string;
  root: "head" | "body";
  kept: boolean;
  covered: boolean;
}

interface HtmlPage {
  index: number;
  path: string;
  html: string;
}

interface NamedBlock {
  exact: string;
  virtual: string;
  path: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function extractSharedBlocks(result: ImportResult): ImportResult {
  const pages = htmlPages(result.pages);
  const prior = result.report.uncertain ?? [];
  if (pages.length < 2) return finish(result, result.pages, dedupe(prior));

  const regions: Region[] = [];
  for (const page of pages) {
    let nodes: Node[];
    try {
      nodes = scan(page.html);
    } catch {
      continue;
    }
    const body = nodes.findIndex((node) => node.tag === "body");
    const head = nodes.findIndex((node) => node.tag === "head");
    collect(page, nodes, body, "body", regions);
    collect(page, nodes, head, "head", regions);
  }

  const total = pages.length;
  const pagesByExact = new Map<string, Set<number>>();
  for (const region of regions) {
    let set = pagesByExact.get(region.exact);
    if (!set) {
      set = new Set();
      pagesByExact.set(region.exact, set);
    }
    set.add(region.page);
  }
  const extractable = new Set<string>();
  for (const [exact, set] of pagesByExact) {
    if (isMajority(set.size, total)) extractable.add(exact);
  }

  const byPage = new Map<number, Region[]>();
  for (const region of regions) {
    const list = byPage.get(region.page);
    if (list) list.push(region);
    else byPage.set(region.page, [region]);
  }

  const kept: Region[] = [];
  for (const list of byPage.values()) {
    const chosen = chooseKept(list, extractable);
    const chosenSet = new Set(chosen);
    for (const region of chosen) {
      region.kept = true;
      kept.push(region);
    }
    for (const region of list) {
      if (chosenSet.has(region)) continue;
      region.covered = chosen.some((outer) => contains(outer, region));
    }
  }

  const names = nameBlocks(kept);
  const rewritten = new Map<number, string>();
  for (const page of pages) {
    const list = (byPage.get(page.index) ?? []).filter((region) => region.kept);
    if (list.length === 0) continue;
    const ordered = [...list].sort((a, b) => b.start - a.start);
    let html = page.html;
    let changed = false;
    for (const region of ordered) {
      const named = names.get(region.exact);
      if (!named) continue;
      if (region.start < 0 || region.end > html.length || region.start >= region.end) continue;
      html =
        html.slice(0, region.start) +
        includeDirective(named.virtual, region.active) +
        html.slice(region.end);
      changed = true;
    }
    if (changed) rewritten.set(page.index, html);
  }

  const includePaths = new Set<string>();
  const includes: CapturedFile[] = [];
  for (const named of names.values()) {
    if (includePaths.has(named.path)) continue;
    includePaths.add(named.path);
    includes.push({
      path: named.path,
      body: encoder.encode(named.exact),
      contentType: "text/html; charset=utf-8"
    });
  }
  includes.sort((a, b) => a.path.localeCompare(b.path));

  const pageFiles = result.pages.flatMap((file, index) => {
    if (includePaths.has(file.path)) return [];
    const html = rewritten.get(index);
    if (html === undefined) return [file];
    return [{ ...file, body: encoder.encode(html) }];
  });

  const uncertain = dedupe([...prior, ...uncertainItems(regions, names, total)]);
  return finish(result, [...pageFiles, ...includes], uncertain);
}

function finish(
  result: ImportResult,
  pages: CapturedFile[],
  uncertain: FidelityItem[]
): ImportResult {
  const report: FidelityReport = {
    forms: result.report.forms,
    plugins: result.report.plugins,
    missingAssets: result.report.missingAssets,
    cssBackgrounds: result.report.cssBackgrounds,
    uncertain
  };
  return { ...result, pages, report };
}

function htmlPages(files: CapturedFile[]): HtmlPage[] {
  const pages: HtmlPage[] = [];
  files.forEach((file, index) => {
    if (!isHtmlPage(file)) return;
    try {
      pages.push({ index, path: file.path, html: decoder.decode(file.body) });
    } catch {
      // Leave a page that is not UTF-8 inline.
    }
  });
  return pages;
}

function isHtmlPage(file: CapturedFile): boolean {
  const parts = file.path.split("/");
  if (parts.includes("_inc") || parts.includes("_templates") || parts.includes(".flagstage")) {
    return false;
  }
  if (file.contentType.toLowerCase().includes("html")) return true;
  return file.path.endsWith(".html") || file.path.endsWith(".htm");
}

function isMajority(count: number, total: number): boolean {
  return total >= 2 && count * 2 > total;
}

function contains(outer: Region, inner: Region): boolean {
  return (
    outer.start <= inner.start &&
    outer.end >= inner.end &&
    (outer.start < inner.start || outer.end > inner.end)
  );
}

function chooseKept(list: Region[], extractable: Set<string>): Region[] {
  const candidates = list.filter((region) => extractable.has(region.exact));
  const outer = candidates.filter(
    (region) => !candidates.some((other) => other !== region && contains(other, region))
  );
  outer.sort((a, b) => a.start - b.start || b.end - a.end);
  const disjoint: Region[] = [];
  let end = -1;
  for (const region of outer) {
    if (region.start < end) continue;
    disjoint.push(region);
    end = region.end;
  }
  return disjoint;
}

function nameBlocks(kept: Region[]): Map<string, NamedBlock> {
  const groups: Array<Region & { virtual: string; file: string }> = [];
  const seen = new Set<string>();
  for (const region of kept) {
    if (seen.has(region.exact)) continue;
    seen.add(region.exact);
    groups.push({ ...region, virtual: "", file: "" });
  }
  groups.sort((a, b) => a.slot.localeCompare(b.slot) || a.exact.localeCompare(b.exact));
  const used = new Set<string>();
  const names = new Map<string, NamedBlock>();
  for (const group of groups) {
    const base = semanticBase(group);
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base}-${n}`;
      n += 1;
    }
    used.add(name);
    const file = `_inc/${name}.html`;
    const named = { exact: group.exact, path: file, virtual: `/${file}` };
    names.set(group.exact, named);
  }
  return names;
}

function semanticBase(region: Pick<Region, "tag" | "classFirst" | "root" | "slot">): string {
  const cls = region.classFirst.toLowerCase();
  if (region.root === "head") {
    if (region.tag === "link") return "head-link";
    if (region.tag === "meta") return "head-meta";
    if (region.tag === "script") return "head-script";
    if (region.tag === "style") return "head-style";
    return `head-${slug(region.tag)}`;
  }
  if (region.tag === "header" || cls.includes("header") || cls.includes("masthead"))
    return "header";
  if (region.tag === "footer" || cls.includes("footer")) return "footer";
  if (region.tag === "nav" || cls.includes("nav")) return "nav";
  if (cls.includes("newsletter")) return "newsletter";
  if (cls.includes("cookie")) return "cookie";
  if (cls.includes("alert") || cls.includes("banner")) return "alert";
  if (cls.includes("sidebar")) return "sidebar";
  return slug(region.slot.replaceAll("/", "-")) || "block";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function includeDirective(virtual: string, active: string | undefined): string {
  if (active && active.length > 0 && !/[\s"'<>]/.test(active) && !active.includes("--")) {
    return `<!--#include virtual="${virtual}" active="${active}" -->`;
  }
  return `<!--#include virtual="${virtual}" -->`;
}

function uncertainItems(
  regions: Region[],
  names: Map<string, NamedBlock>,
  total: number
): FidelityItem[] {
  const bySlot = new Map<string, Region[]>();
  for (const region of regions) {
    const list = bySlot.get(region.slot);
    if (list) list.push(region);
    else bySlot.set(region.slot, [region]);
  }
  const items: FidelityItem[] = [];
  const described = new Map<string, { canon: string; tokens: Set<string> }>();
  const facts = (exact: string) => {
    let found = described.get(exact);
    if (!found) {
      found = { canon: canonical(exact), tokens: tokenSet(exact) };
      described.set(exact, found);
    }
    return found;
  };

  for (const list of bySlot.values()) {
    const kept = uniqueExact(list.filter((region) => region.kept));
    if (kept.length > 0) {
      const refs = kept.map((region) => {
        const named = names.get(region.exact);
        return { ...facts(region.exact), virtual: named?.virtual ?? "" };
      });
      for (const region of list) {
        if (region.kept || region.covered || extractableCopy(region, kept)) continue;
        const info = facts(region.exact);
        let best = 0;
        let bestCanon = "";
        let bestVirtual = "";
        for (const ref of refs) {
          const score = jaccard(info.tokens, ref.tokens);
          if (score > best) {
            best = score;
            bestCanon = ref.canon;
            bestVirtual = ref.virtual;
          }
        }
        if (best < SIMILAR || !bestVirtual) continue;
        const kind = info.canon === bestCanon ? "near-duplicate" : "drift";
        items.push(item(region, kind, closeDetail(region.slot, bestVirtual)));
      }
      continue;
    }

    const visible = list.filter((region) => !region.covered);
    const pageSets = new Map<string, Set<number>>();
    for (const region of visible) {
      let set = pageSets.get(region.exact);
      if (!set) {
        set = new Set();
        pageSets.set(region.exact, set);
      }
      set.add(region.page);
    }
    let topExact = "";
    let topCount = 0;
    for (const [exact, set] of pageSets) {
      if (set.size > topCount) {
        topExact = exact;
        topCount = set.size;
      }
    }
    if (!topExact || isMajority(topCount, total)) continue;
    const top = facts(topExact);
    const similar: Region[] = [];
    const similarPages = new Set<number>();
    for (const region of visible) {
      const info = facts(region.exact);
      const score = region.exact === topExact ? 1 : jaccard(info.tokens, top.tokens);
      if (score < SIMILAR) continue;
      similar.push(region);
      similarPages.add(region.page);
    }
    if (!isMajority(similarPages.size, total)) continue;
    for (const region of similar) {
      items.push(item(region, "near-duplicate", ambiguousDetail(region.slot)));
    }
  }
  return items;
}

function uniqueExact(list: Region[]): Region[] {
  const seen = new Set<string>();
  const out: Region[] = [];
  for (const region of list) {
    if (seen.has(region.exact)) continue;
    seen.add(region.exact);
    out.push(region);
  }
  return out;
}

function extractableCopy(region: Region, kept: Region[]): boolean {
  return kept.some((ref) => ref.exact === region.exact);
}

function item(region: Region, kind: string, detail: string): FidelityItem {
  return { page: region.path, kind, detail };
}

function closeDetail(slot: string, virtual: string): string {
  return `Left the ${slot} block inline. It is close to ${virtual} but not an exact match after normalizing the current-page marker.`;
}

function ambiguousDetail(slot: string): string {
  return `Left the ${slot} block inline. Similar copies appear on most pages, and no copy is the same on most pages.`;
}

function dedupe(items: FidelityItem[]): FidelityItem[] {
  const seen = new Set<string>();
  const out: FidelityItem[] = [];
  for (const entry of items) {
    const key = `${entry.page}\0${entry.kind}\0${entry.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  out.sort(
    (a, b) =>
      a.page.localeCompare(b.page) ||
      a.kind.localeCompare(b.kind) ||
      a.detail.localeCompare(b.detail)
  );
  return out;
}

function collect(
  page: HtmlPage,
  nodes: Node[],
  root: number,
  kind: "head" | "body",
  regions: Region[]
): void {
  if (root < 0) return;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node || !node.closed || node.end <= node.start) continue;
    const depth = depthUnder(nodes, index, root);
    if (depth < 1 || depth > MAX_DEPTH) continue;
    if (kind === "body" && (node.tag === "script" || node.tag === "style")) continue;
    const chrome =
      CHROME_TAG.has(node.tag) || (node.classFirst !== "" && CHROME_CLASS.test(node.classFirst));
    if (kind === "body" && node.textLen < MIN_TEXT && node.links < MIN_LINKS && !chrome) continue;
    const normalized = normalizeRegion(page.html, node.start, node.end);
    if (normalized.text.trim() === "" || normalized.text.includes("<!--#include")) continue;
    regions.push({
      page: page.index,
      path: page.path,
      start: node.start,
      end: node.end,
      slot: slotOf(nodes, index, root),
      exact: normalized.text,
      active: normalized.active,
      tag: node.tag,
      classFirst: node.classFirst,
      root: kind,
      kept: false,
      covered: false
    });
  }
}

function depthUnder(nodes: Node[], index: number, root: number): number {
  let depth = 0;
  let current = index;
  while (current !== -1 && depth <= MAX_DEPTH + 1) {
    if (current === root) return depth;
    current = nodes[current]?.parent ?? -1;
    depth += 1;
  }
  return -1;
}

function slotOf(nodes: Node[], index: number, root: number): string {
  const parts: string[] = [];
  let current = index;
  let guard = 0;
  while (current !== -1 && current !== root && guard < 16) {
    const node = nodes[current];
    if (!node) break;
    parts.push(node.classFirst ? `${node.tag}.${node.classFirst}` : node.tag);
    current = node.parent;
    guard += 1;
  }
  parts.reverse();
  return parts.join("/");
}

function scan(html: string): Node[] {
  const nodes: Node[] = [];
  const stack: number[] = [];

  function appendText(text: string): void {
    if (text.length === 0) return;
    for (const index of stack) nodes[index]?.parts.push(text);
  }

  function closeNode(index: number, end: number, closed: boolean): void {
    const node = nodes[index];
    if (!node) return;
    node.end = end;
    node.closed = closed;
    node.textLen = node.parts.join("").trim().length;
    node.parts = [];
  }

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      appendText(html.slice(i));
      break;
    }
    if (lt > i) appendText(html.slice(i, lt));
    const tag = readTag(html, lt);
    if (!tag || tag.end <= lt) {
      appendText("<");
      i = lt + 1;
      continue;
    }
    if (tag.kind === "comment" || tag.kind === "other") {
      i = tag.end;
      continue;
    }
    if (tag.kind === "close") {
      let found = -1;
      for (let slot = stack.length - 1; slot >= 0; slot -= 1) {
        const index = stack[slot];
        if (index !== undefined && nodes[index]?.tag === tag.name) {
          found = slot;
          break;
        }
      }
      if (found >= 0) {
        while (stack.length - 1 > found) {
          const index = stack.pop();
          if (index !== undefined) closeNode(index, lt, false);
        }
        const index = stack.pop();
        if (index !== undefined) closeNode(index, tag.end, true);
      }
      i = tag.end;
      continue;
    }

    const index = nodes.length;
    const parent = stack.length > 0 ? (stack[stack.length - 1] ?? -1) : -1;
    nodes.push({
      tag: tag.name,
      start: lt,
      end: tag.end,
      classFirst: classFirstOf(tag.attrs),
      parent,
      closed: false,
      links: 0,
      textLen: 0,
      parts: []
    });
    if (tag.name === "a") {
      for (const ancestor of stack) nodes[ancestor]!.links += 1;
    }
    if (tag.selfClosing || VOID.has(tag.name)) {
      const node = nodes[index];
      if (node) {
        node.closed = true;
        node.end = tag.end;
      }
      i = tag.end;
      continue;
    }
    stack.push(index);
    if (RAW.has(tag.name)) {
      const close = findClose(html, tag.end, tag.name, html.length);
      appendText(html.slice(tag.end, close ? close.contentEnd : html.length));
      stack.pop();
      closeNode(index, close ? close.end : html.length, close !== null);
      i = close ? close.end : html.length;
      continue;
    }
    i = tag.end;
  }
  while (stack.length > 0) {
    const index = stack.pop();
    if (index !== undefined) closeNode(index, html.length, false);
  }
  return nodes;
}

function classFirstOf(attrs: Attr[]): string {
  const cls = attrs.find((attr) => attr.name === "class");
  if (!cls) return "";
  for (const token of cls.value.split(/\s+/)) {
    if (token && !STATE_CLASS.has(token)) return token;
  }
  return "";
}

function normalizeRegion(
  html: string,
  start: number,
  end: number
): { text: string; active?: string } {
  let out = "";
  let i = start;
  let active: string | undefined;
  while (i < end) {
    const lt = html.indexOf("<", i);
    if (lt < 0 || lt >= end) {
      out += html.slice(i, end);
      break;
    }
    out += html.slice(i, lt);
    const tag = readTag(html, lt);
    if (!tag || tag.end <= lt) {
      out += "<";
      i = lt + 1;
      continue;
    }
    if (tag.kind === "open" && RAW.has(tag.name) && !tag.selfClosing && !VOID.has(tag.name)) {
      const rewritten = rewriteOpen(html, tag);
      out += rewritten.raw;
      if (active === undefined && rewritten.active) active = rewritten.active;
      const close = findClose(html, tag.end, tag.name, end);
      if (!close) {
        out += html.slice(tag.end, end);
        break;
      }
      out += html.slice(tag.end, close.end);
      i = close.end;
      continue;
    }
    if (tag.kind === "open") {
      const rewritten = rewriteOpen(html, tag);
      out += rewritten.raw;
      if (active === undefined && rewritten.active) active = rewritten.active;
      i = Math.min(tag.end, end);
      continue;
    }
    const stop = Math.min(tag.end, end);
    out += html.slice(lt, stop);
    i = stop;
  }
  return active === undefined ? { text: out } : { text: out, active };
}

function rewriteOpen(html: string, tag: Tag): { raw: string; active?: string } {
  const original = html.slice(tag.start, tag.end);
  const classAttr = tag.attrs.find((attr) => attr.name === "class");
  const aria = tag.attrs.find((attr) => attr.name === "aria-current");
  const href = tag.attrs.find((attr) => attr.name === "href");
  const edits: Array<{ start: number; end: number; text: string }> = [];
  let current = false;
  if (aria) {
    edits.push({ start: aria.start, end: aria.end, text: "" });
    current = true;
  }
  if (classAttr) {
    const tokens = classAttr.value.split(/\s+/).filter(Boolean);
    const kept = tokens.filter((token) => !STATE_CLASS.has(token));
    if (kept.length !== tokens.length) {
      if (tokens.some((token) => CURRENT_CLASS.has(token))) current = true;
      if (kept.length === 0) edits.push({ start: classAttr.start, end: classAttr.end, text: "" });
      else {
        const quote = classAttr.quote === "'" ? "'" : classAttr.quote;
        const value = kept.join(" ");
        const rendered = quote ? ` class=${quote}${value}${quote}` : ` class=${value}`;
        edits.push({ start: classAttr.start, end: classAttr.end, text: rendered });
      }
    }
  }
  if (edits.length === 0) return { raw: original };
  edits.sort((a, b) => a.start - b.start);
  for (let index = 1; index < edits.length; index += 1) {
    const prev = edits[index - 1];
    const next = edits[index];
    if (!prev || !next || next.start < prev.end) return { raw: original };
  }
  let raw = original;
  for (let index = edits.length - 1; index >= 0; index -= 1) {
    const edit = edits[index];
    if (!edit) continue;
    const relStart = edit.start - tag.start;
    const relEnd = edit.end - tag.start;
    if (relStart < 0 || relEnd > raw.length || relStart > relEnd) return { raw: original };
    raw = raw.slice(0, relStart) + edit.text + raw.slice(relEnd);
  }
  if (current && tag.name === "a" && href && href.value !== "") return { raw, active: href.value };
  return { raw };
}

function canonical(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const tag = readTag(html, lt);
    if (!tag || tag.end <= lt) {
      out += "<";
      i = lt + 1;
      continue;
    }
    if (tag.kind === "open") {
      const attrs = [...tag.attrs].sort(
        (a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value)
      );
      let built = `<${tag.name}`;
      for (const attr of attrs) {
        if (attr.quote) built += ` ${attr.name}=${attr.quote}${attr.value}${attr.quote}`;
        else if (html.slice(attr.start, attr.end).includes("="))
          built += ` ${attr.name}=${attr.value}`;
        else built += ` ${attr.name}`;
      }
      built += tag.selfClosing ? "/>" : ">";
      out += built;
      if (RAW.has(tag.name) && !tag.selfClosing && !VOID.has(tag.name)) {
        const close = findClose(html, tag.end, tag.name, html.length);
        if (close) {
          out += html.slice(tag.end, close.end);
          i = close.end;
          continue;
        }
      }
    } else if (tag.kind === "close") {
      out += `</${tag.name}>`;
    } else {
      out += html.slice(lt, tag.end);
    }
    i = tag.end;
  }
  return out.replace(/\s+/g, " ").trim();
}

function tokenSet(html: string): Set<string> {
  const set = new Set<string>();
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  for (const word of text.split(/[^a-z0-9]+/)) {
    if (word) set.add(word);
  }
  const hrefs = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const match of html.matchAll(hrefs)) {
    const href = match[1] ?? match[2] ?? match[3];
    if (href) set.add(`href:${href}`);
  }
  return set;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  const [small, large] = left.size < right.size ? [left, right] : [right, left];
  for (const token of small) {
    if (large.has(token)) shared += 1;
  }
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

function findClose(
  html: string,
  from: number,
  name: string,
  limit: number
): { contentEnd: number; end: number } | null {
  const last = Math.min(limit, html.length);
  for (let i = from; i < last; i += 1) {
    if (html[i] !== "<" || html[i + 1] !== "/") continue;
    let cursor = i + 2;
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
    if (html[cursor] === ">") return { contentEnd: i, end: cursor + 1 };
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
  let i = start + (closing ? 2 : 1);
  if (!isNameStart(html[i] ?? "")) return null;
  const nameStart = i;
  i += 1;
  while (isNameChar(html[i] ?? "")) i += 1;
  const name = html.slice(nameStart, i).toLowerCase();
  const attrs: Attr[] = [];
  while (i < html.length) {
    const whitespace = i;
    while (isSpace(html[i] ?? "")) i += 1;
    const char = html[i];
    if (char === undefined) break;
    if (char === ">") {
      return {
        kind: closing ? "close" : "open",
        name,
        start,
        end: i + 1,
        attrs,
        selfClosing: false
      };
    }
    if (char === "/" && html[i + 1] === ">") {
      return { kind: "open", name, start, end: i + 2, attrs, selfClosing: true };
    }
    if (!isAttrName(char)) {
      const end = html.indexOf(">", i);
      return {
        kind: closing ? "close" : "open",
        name,
        start,
        end: end < 0 ? html.length : end + 1,
        attrs,
        selfClosing: false
      };
    }
    const nameAt = i;
    while (isAttrName(html[i] ?? "")) i += 1;
    const attrName = html.slice(nameAt, i).toLowerCase();
    while (isSpace(html[i] ?? "")) i += 1;
    let value = "";
    let quote: '"' | "'" | "" = "";
    if (html[i] === "=") {
      i += 1;
      while (isSpace(html[i] ?? "")) i += 1;
      const q = html[i];
      if (q === '"' || q === "'") {
        quote = q;
        i += 1;
        const valueStart = i;
        const endQuote = html.indexOf(q, i);
        if (endQuote < 0) {
          value = html.slice(valueStart);
          i = html.length;
        } else {
          value = html.slice(valueStart, endQuote);
          i = endQuote + 1;
        }
      } else {
        const valueStart = i;
        while (i < html.length && !isSpace(html[i] ?? "") && html[i] !== ">") i += 1;
        value = html.slice(valueStart, i);
      }
    }
    attrs.push({ name: attrName, value, quote, start: whitespace, end: i });
  }
  return { kind: closing ? "close" : "open", name, start, end: i, attrs, selfClosing: false };
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
