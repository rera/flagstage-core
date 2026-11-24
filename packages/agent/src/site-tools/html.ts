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

const RAW = new Set(["script", "style", "textarea"]);
const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting"]);

export class SelectorError extends Error {
  constructor(message = "Unsupported selector") {
    super(message);
    this.name = "SelectorError";
  }
}

type RawAttr = { name: string; value: string; valueStart: number; valueEnd: number };

type RawTag = {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  end: number;
  attrs: RawAttr[];
};

export type Element = {
  name: string;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  parent: number;
  attrs: RawAttr[];
  selfClosing: boolean;
};

type Span = { start: number; end: number };

export type ReplaceOptions = {
  find: string;
  replace: string;
  wholeWord: boolean;
  caseSensitive: boolean;
  preserveCase: boolean;
  skipQuotes: boolean;
  skipAttributes: boolean;
};

type TextFlags = {
  wholeWord: boolean;
  caseSensitive: boolean;
  skipQuotes: boolean;
  skipAttributes: boolean;
};

type AttrOp = "exists" | "=" | "~=" | "*=" | "^=" | "$=";

type Compound = {
  tag?: string;
  id?: string;
  classes: string[];
  attrs: { name: string; op: AttrOp; value?: string }[];
};

type Step = { combinator: "desc" | "child"; compound: Compound };

function charAt(text: string, index: number): string {
  return index < 0 || index >= text.length ? "" : text.charAt(index);
}

function isWord(char: string): boolean {
  return char !== "" && /[\p{L}\p{N}_]/u.test(char);
}

function leftBoundary(text: string, start: number): boolean {
  return !isWord(charAt(text, start - 1));
}

function rightBoundary(text: string, end: number): boolean {
  return !isWord(charAt(text, end));
}

function isTagStart(html: string, index: number): boolean {
  const next = charAt(html, index + 1);
  return /[A-Za-z/!?]/.test(next);
}

function readTag(html: string, start: number): RawTag | null {
  if (charAt(html, start) !== "<") return null;
  let i = start + 1;
  let closing = false;
  if (charAt(html, i) === "/") {
    closing = true;
    i += 1;
  }
  if (!/[A-Za-z]/.test(charAt(html, i))) return null;
  const nameStart = i;
  while (/[A-Za-z0-9:-]/.test(charAt(html, i))) i += 1;
  const name = html.slice(nameStart, i);
  const attrs: RawAttr[] = [];
  while (i < html.length) {
    while (/\s/.test(charAt(html, i))) i += 1;
    if (charAt(html, i) === ">") {
      return { name, closing, selfClosing: false, end: i + 1, attrs };
    }
    if (charAt(html, i) === "/" && charAt(html, i + 1) === ">") {
      return { name, closing, selfClosing: true, end: i + 2, attrs };
    }
    if (!/[A-Za-z_:]/.test(charAt(html, i))) return null;
    const attrStart = i;
    while (/[^\s=/>]/.test(charAt(html, i))) i += 1;
    const attrName = html.slice(attrStart, i).toLowerCase();
    while (/\s/.test(charAt(html, i))) i += 1;
    if (charAt(html, i) !== "=") {
      attrs.push({ name: attrName, value: "", valueStart: i, valueEnd: i });
      continue;
    }
    i += 1;
    while (/\s/.test(charAt(html, i))) i += 1;
    const quote = charAt(html, i);
    let valueStart = i;
    let valueEnd = i;
    if (quote === '"' || quote === "'") {
      i += 1;
      valueStart = i;
      while (i < html.length && charAt(html, i) !== quote) i += 1;
      valueEnd = i;
      if (charAt(html, i) === quote) i += 1;
    } else {
      valueStart = i;
      while (
        i < html.length &&
        !/[\s>]/.test(charAt(html, i)) &&
        !(charAt(html, i) === "/" && charAt(html, i + 1) === ">")
      ) {
        i += 1;
      }
      valueEnd = i;
    }
    attrs.push({
      name: attrName,
      value: html.slice(valueStart, valueEnd),
      valueStart,
      valueEnd
    });
  }
  return null;
}

function closeTagEnd(html: string, from: number, name: string): number {
  const needle = `</${name}`;
  const lower = html.toLowerCase();
  let i = from;
  while (i < html.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) return html.length;
    const after = at + needle.length;
    const next = charAt(html, after);
    if (next === ">" || next === "/" || /\s/.test(next)) {
      const gt = html.indexOf(">", after);
      return gt < 0 ? html.length : gt + 1;
    }
    i = after;
  }
  return html.length;
}

export function parseElements(html: string): Element[] {
  const elements: Element[] = [];
  const stack: number[] = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (charAt(html, i) !== "<" || !isTagStart(html, i)) {
      i += 1;
      continue;
    }
    const tag = readTag(html, i);
    if (!tag) {
      i += 1;
      continue;
    }
    const name = tag.name.toLowerCase();
    if (tag.closing) {
      for (let slot = stack.length - 1; slot >= 0; slot -= 1) {
        const openIndex = stack[slot];
        const open = openIndex === undefined ? undefined : elements[openIndex];
        if (open && open.name === name) {
          open.closeStart = i;
          open.end = tag.end;
          stack.length = slot;
          break;
        }
      }
      i = tag.end;
      continue;
    }
    const selfClosing = tag.selfClosing || VOID.has(name);
    const element: Element = {
      name,
      start: i,
      openEnd: tag.end,
      closeStart: tag.end,
      end: tag.end,
      parent: stack.length > 0 ? (stack[stack.length - 1] ?? -1) : -1,
      attrs: tag.attrs,
      selfClosing
    };
    const index = elements.length;
    elements.push(element);
    if (RAW.has(name) && !selfClosing) {
      i = closeTagEnd(html, tag.end, name);
      element.closeStart = Math.max(tag.end, i - `</${name}>`.length);
      element.end = i;
      continue;
    }
    if (!selfClosing) stack.push(index);
    i = tag.end;
  }
  return elements;
}

function attrValue(element: Element, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

function editableSpans(html: string, flags: TextFlags): Span[] {
  const spans: Span[] = [];
  let i = 0;
  let quoteDepth = 0;
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (charAt(html, i) === "<" && isTagStart(html, i)) {
      const tag = readTag(html, i);
      if (!tag) {
        i += 1;
        continue;
      }
      const name = tag.name.toLowerCase();
      const inside = quoteDepth > 0;
      if (!flags.skipAttributes && !inside && !tag.closing) {
        for (const attr of tag.attrs) {
          if (attr.valueEnd > attr.valueStart) {
            spans.push({ start: attr.valueStart, end: attr.valueEnd });
          }
        }
      }
      if (tag.closing) {
        if (name === "blockquote" || name === "q") quoteDepth = Math.max(0, quoteDepth - 1);
      } else if (RAW.has(name) && !tag.selfClosing && !VOID.has(name)) {
        i = closeTagEnd(html, tag.end, name);
        continue;
      } else if (name === "blockquote" || name === "q") {
        quoteDepth += 1;
      }
      i = tag.end;
      continue;
    }
    const start = i;
    i += 1;
    while (
      i < html.length &&
      !(charAt(html, i) === "<" && (html.startsWith("<!--", i) || isTagStart(html, i)))
    ) {
      i += 1;
    }
    if (quoteDepth === 0 || !flags.skipQuotes) pushText(spans, html, start, i, flags.skipQuotes);
  }
  return spans;
}

function pushText(
  spans: Span[],
  html: string,
  start: number,
  end: number,
  skipQuotes: boolean
): void {
  if (!skipQuotes) {
    if (end > start) spans.push({ start, end });
    return;
  }
  let mode: "none" | "double" | "curly" | "single" = "none";
  let seg = start;
  for (let i = start; i < end; i += 1) {
    const ch = charAt(html, i);
    if (mode === "none") {
      if (ch === '"') {
        if (i > seg) spans.push({ start: seg, end: i });
        mode = "double";
        seg = i + 1;
      } else if (ch === "\u201c") {
        if (i > seg) spans.push({ start: seg, end: i });
        mode = "curly";
        seg = i + 1;
      } else if (ch === "\u2018") {
        if (i > seg) spans.push({ start: seg, end: i });
        mode = "single";
        seg = i + 1;
      }
      continue;
    }
    const closed =
      (mode === "double" && ch === '"') ||
      (mode === "curly" && ch === "\u201d") ||
      (mode === "single" && ch === "\u2019");
    if (closed) {
      mode = "none";
      seg = i + 1;
    }
  }
  if (mode === "none" && end > seg) spans.push({ start: seg, end: end });
}

function findMatches(
  text: string,
  needle: string,
  wholeWord: boolean,
  caseSensitive: boolean
): Span[] {
  if (!needle) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const pin = caseSensitive ? needle : needle.toLowerCase();
  const found: Span[] = [];
  let from = 0;
  while (from <= hay.length - pin.length) {
    const at = hay.indexOf(pin, from);
    if (at < 0) break;
    const end = at + pin.length;
    if (!wholeWord || (leftBoundary(text, at) && rightBoundary(text, end))) {
      found.push({ start: at, end });
      from = end;
    } else {
      from = at + 1;
    }
  }
  return found;
}

function applyCase(sample: string, replacement: string): string {
  if (!sample) return replacement;
  const upper = sample.toUpperCase();
  const lower = sample.toLowerCase();
  if (sample === upper && sample !== lower) return replacement.toUpperCase();
  if (sample === lower) return replacement.toLowerCase();
  const rest = sample.slice(1);
  if (charAt(sample, 0) === charAt(sample, 0).toUpperCase() && rest === rest.toLowerCase()) {
    return charAt(replacement, 0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
}

export function replaceInHtml(html: string, options: ReplaceOptions): string {
  if (!options.find) return html;
  const spans = editableSpans(html, options);
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += html.slice(cursor, span.start);
    out += replaceSpan(html.slice(span.start, span.end), options);
    cursor = span.end;
  }
  out += html.slice(cursor);
  return out;
}

function replaceSpan(text: string, options: ReplaceOptions): string {
  const matches = findMatches(text, options.find, options.wholeWord, options.caseSensitive);
  if (matches.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const match of matches) {
    out += text.slice(cursor, match.start);
    const sample = text.slice(match.start, match.end);
    out +=
      options.preserveCase && !options.caseSensitive
        ? applyCase(sample, options.replace)
        : options.replace;
    cursor = match.end;
  }
  out += text.slice(cursor);
  return out;
}

export function htmlHasText(html: string, needle: string, flags: TextFlags): boolean {
  if (!needle) return false;
  for (const span of editableSpans(html, flags)) {
    const slice = html.slice(span.start, span.end);
    if (findMatches(slice, needle, flags.wholeWord, flags.caseSensitive).length > 0) return true;
  }
  return false;
}

function skipSpace(source: string, index: number): number {
  let i = index;
  while (/\s/.test(charAt(source, i))) i += 1;
  return i;
}

function readIdent(source: string, index: number): { value: string; index: number } {
  if (!/[A-Za-z*_]/.test(charAt(source, index))) throw new SelectorError();
  if (charAt(source, index) === "*") return { value: "*", index: index + 1 };
  let i = index + 1;
  while (/[A-Za-z0-9_-]/.test(charAt(source, i))) i += 1;
  return { value: source.slice(index, i), index: i };
}

function readCompound(source: string, index: number): { compound: Compound; index: number } {
  const compound: Compound = { classes: [], attrs: [] };
  let i = index;
  if (/[A-Za-z*]/.test(charAt(source, i))) {
    const ident = readIdent(source, i);
    i = ident.index;
    if (ident.value !== "*") compound.tag = ident.value.toLowerCase();
  }
  while (i < source.length) {
    const ch = charAt(source, i);
    if (ch === ".") {
      const ident = readIdent(source, i + 1);
      compound.classes.push(ident.value.toLowerCase());
      i = ident.index;
      continue;
    }
    if (ch === "#") {
      const ident = readIdent(source, i + 1);
      compound.id = ident.value;
      i = ident.index;
      continue;
    }
    if (ch !== "[") break;
    const name = readIdent(source, i + 1);
    i = name.index;
    if (charAt(source, i) === "]") {
      compound.attrs.push({ name: name.value.toLowerCase(), op: "exists" });
      i += 1;
      continue;
    }
    let op: AttrOp = "=";
    const pair = source.slice(i, i + 2);
    if (pair === "~=" || pair === "*=" || pair === "^=" || pair === "$=") {
      op = pair;
      i += 2;
    } else if (charAt(source, i) === "=") {
      i += 1;
    } else {
      throw new SelectorError();
    }
    let value = "";
    const quote = charAt(source, i);
    if (quote === '"' || quote === "'") {
      const end = source.indexOf(quote, i + 1);
      if (end < 0) throw new SelectorError();
      value = source.slice(i + 1, end);
      i = end + 1;
    } else {
      const ident = readIdent(source, i);
      value = ident.value;
      i = ident.index;
    }
    if (charAt(source, i) !== "]") throw new SelectorError();
    i += 1;
    compound.attrs.push({ name: name.value.toLowerCase(), op, value });
  }
  if (
    !compound.tag &&
    !compound.id &&
    compound.classes.length === 0 &&
    compound.attrs.length === 0
  ) {
    throw new SelectorError();
  }
  return { compound, index: i };
}

function parseSelectorList(source: string): Step[][] {
  const alternatives: Step[][] = [];
  let i = skipSpace(source, 0);
  if (!source.trim()) throw new SelectorError();
  while (i < source.length) {
    const steps: Step[] = [];
    const first = readCompound(source, i);
    steps.push({ combinator: "desc", compound: first.compound });
    i = first.index;
    while (true) {
      const marked = i;
      i = skipSpace(source, i);
      if (i >= source.length || charAt(source, i) === ",") break;
      let combinator: Step["combinator"] = "desc";
      if (charAt(source, i) === ">") {
        combinator = "child";
        i = skipSpace(source, i + 1);
      } else if (marked === i) {
        break;
      }
      if (i >= source.length || charAt(source, i) === ",") break;
      const next = charAt(source, i);
      if (next === "+" || next === "~" || next === ":") throw new SelectorError();
      const compound = readCompound(source, i);
      steps.push({ combinator, compound: compound.compound });
      i = compound.index;
    }
    alternatives.push(steps);
    i = skipSpace(source, i);
    if (i >= source.length) break;
    if (charAt(source, i) !== ",") throw new SelectorError();
    i = skipSpace(source, i + 1);
    if (i >= source.length) throw new SelectorError();
  }
  return alternatives;
}

function compoundMatches(element: Element, compound: Compound): boolean {
  if (compound.tag && element.name !== compound.tag) return false;
  if (compound.id && attrValue(element, "id") !== compound.id) return false;
  if (compound.classes.length > 0) {
    const classes = new Set((attrValue(element, "class") ?? "").split(/\s+/).filter(Boolean));
    if (compound.classes.some((name) => !classes.has(name))) return false;
  }
  for (const attr of compound.attrs) {
    const value = attrValue(element, attr.name);
    if (value === undefined) return false;
    if (attr.op === "exists") continue;
    const expected = attr.value ?? "";
    if (attr.op === "=" && value !== expected) return false;
    if (attr.op === "~=" && !value.split(/\s+/).includes(expected)) return false;
    if (attr.op === "*=" && !value.includes(expected)) return false;
    if (attr.op === "^=" && !value.startsWith(expected)) return false;
    if (attr.op === "$=" && !(expected !== "" && value.endsWith(expected))) return false;
  }
  return true;
}

function elementMatches(element: Element, steps: Step[], elements: Element[]): boolean {
  const visit = (node: Element | null, index: number): boolean => {
    if (index < 0) return true;
    if (!node) return false;
    const step = steps[index];
    if (!step || !compoundMatches(node, step.compound)) return false;
    if (index === 0) return true;
    const parent = node.parent >= 0 ? (elements[node.parent] ?? null) : null;
    if (step.combinator === "child") return visit(parent, index - 1);
    let cursor = parent;
    while (cursor) {
      if (visit(cursor, index - 1)) return true;
      cursor = cursor.parent >= 0 ? (elements[cursor.parent] ?? null) : null;
    }
    return false;
  };
  return visit(element, steps.length - 1);
}

export function htmlMatchesSelector(html: string, selector: string): boolean {
  const alternatives = parseSelectorList(selector);
  const elements = parseElements(html);
  return elements.some((element) =>
    alternatives.some((steps) => elementMatches(element, steps, elements))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function typeNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isArticleType(type: string): boolean {
  const name = type.includes("/") ? type.slice(type.lastIndexOf("/") + 1) : type;
  return ARTICLE_TYPES.has(name);
}

function collectArticles(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectArticles(item, out);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  if (typeNames(record["@type"]).some(isArticleType)) {
    out.push(record);
    return;
  }
  if ("@graph" in record) collectArticles(record["@graph"], out);
  if ("mainEntity" in record) collectArticles(record["mainEntity"], out);
}

function parseJsonLd(raw: string): unknown {
  let body = raw.trim().replace(/^\uFEFF/, "");
  if (body.startsWith("<!--")) return null;
  body = body
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
  if (!body) return null;
  try {
    let parsed: unknown = JSON.parse(body);
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    return parsed;
  } catch {
    return null;
  }
}

type JsonScript = {
  body: string;
  bodyStart: number;
  bodyEnd: number;
  value: unknown;
  article: Record<string, unknown>;
};

function firstArticleScript(html: string): JsonScript | null {
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1] ?? "";
    const typeMatch = attrs.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? "").toLowerCase();
    if (type !== "application/ld+json") continue;
    const body = match[2] ?? "";
    const value = parseJsonLd(body);
    const found: Record<string, unknown>[] = [];
    collectArticles(value, found);
    const article = found[0];
    if (!value || !article) continue;
    const full = match[0];
    const index = match.index ?? 0;
    const openLength = full.length - body.length - "</script>".length;
    return {
      body,
      bodyStart: index + openLength,
      bodyEnd: index + openLength + body.length,
      value,
      article
    };
  }
  return null;
}

function writeScript(html: string, script: JsonScript): string {
  const pretty = script.body.includes("\n");
  const next = pretty ? JSON.stringify(script.value, null, 2) : JSON.stringify(script.value);
  return html.slice(0, script.bodyStart) + next + html.slice(script.bodyEnd);
}

export function htmlMatchesJsonLd(html: string, field: string, expected?: string): boolean {
  const script = firstArticleScript(html);
  if (!script || !Object.prototype.hasOwnProperty.call(script.article, field)) return false;
  const value = script.article[field];
  if (expected === undefined) {
    if (value == null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }
  if (typeof value === "string") {
    if (value.trim() === expected) return true;
    return value.split(",").some((part) => part.trim() === expected);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value) === expected;
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && item.trim() === expected);
  }
  return false;
}

export function setJsonLdField(
  html: string,
  field: string,
  value: unknown,
  remove: boolean
): string {
  const script = firstArticleScript(html);
  if (!script) return html;
  if (remove) {
    if (!Object.prototype.hasOwnProperty.call(script.article, field)) return html;
    delete script.article[field];
    return writeScript(html, script);
  }
  if (JSON.stringify(script.article[field]) === JSON.stringify(value)) return html;
  script.article[field] = value;
  return writeScript(html, script);
}

function keywordList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.flatMap((item) =>
      item
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
    );
  }
  return null;
}

export function sameTag(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function retagJsonLd(html: string, add?: string, remove?: string): string {
  const script = firstArticleScript(html);
  if (!script) return html;
  const current = script.article.keywords;
  const list = keywordList(current);
  if (!list) return html;
  let next = list;
  if (remove) next = next.filter((tag) => !sameTag(tag, remove));
  if (add && !next.some((tag) => sameTag(tag, add))) next = [...next, add.trim()];
  if (next.length === list.length && next.every((tag, index) => tag === list[index])) return html;
  script.article.keywords = typeof current === "string" ? next.join(", ") : next;
  return writeScript(html, script);
}

function innerText(html: string, element: Element): string {
  if (element.selfClosing || element.closeStart <= element.openEnd) return "";
  return html
    .slice(element.openEnd, element.closeStart)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function spliceRanges(
  html: string,
  ranges: { start: number; end: number; text: string }[]
): string {
  const ordered = [...ranges].sort((left, right) => right.start - left.start);
  let out = html;
  let limit = html.length;
  for (const range of ordered) {
    if (range.start < 0 || range.end < range.start || range.end > limit) continue;
    out = out.slice(0, range.start) + range.text + out.slice(range.end);
    limit = range.start;
  }
  return out;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function slugTag(tag: string): string {
  const slug = tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "tag";
}

function isTagAnchor(element: Element): boolean {
  return (attrValue(element, "rel") ?? "").split(/\s+/).includes("tag");
}

export function retagMarkup(html: string, add?: string, remove?: string): string {
  let next = retagMeta(html, add, remove);
  next = retagAnchors(next, remove);
  if (add) next = addAnchor(next, add);
  return next;
}

function metaContent(element: Element): string | undefined {
  const key = (attrValue(element, "property") ?? attrValue(element, "name") ?? "").toLowerCase();
  if (key !== "article:tag") return undefined;
  return attrValue(element, "content");
}

function retagMeta(html: string, add?: string, remove?: string): string {
  const elements = parseElements(html);
  const metas = elements.filter((element) => metaContent(element) !== undefined);
  const ranges: { start: number; end: number; text: string }[] = [];
  if (remove) {
    for (const meta of metas) {
      const content = metaContent(meta) ?? "";
      if (!sameTag(content, remove)) continue;
      let end = meta.end;
      if (charAt(html, end) === "\n") end += 1;
      ranges.push({ start: meta.start, end, text: "" });
    }
  }
  const next = ranges.length > 0 ? spliceRanges(html, ranges) : html;
  if (!add) return next;
  const again = parseElements(next);
  const still = again.some((element) => {
    const content = metaContent(element);
    return content !== undefined && sameTag(content, add);
  });
  if (still) return next;
  const tag = `<meta property="article:tag" content="${escapeAttr(add.trim())}">`;
  const last = [...again].reverse().find((element) => metaContent(element) !== undefined);
  if (last) return next.slice(0, last.end) + "\n" + tag + next.slice(last.end);
  const head = next.toLowerCase().indexOf("</head>");
  if (head >= 0) return next.slice(0, head) + tag + "\n" + next.slice(head);
  return tag + "\n" + next;
}

function retagAnchors(html: string, remove?: string): string {
  if (!remove) return html;
  const elements = parseElements(html);
  const ranges: { start: number; end: number; text: string }[] = [];
  for (const element of elements) {
    if (element.name !== "a" || !isTagAnchor(element)) continue;
    if (!sameTag(innerText(html, element), remove)) continue;
    const parent = element.parent >= 0 ? elements[element.parent] : undefined;
    const dropParent =
      parent?.name === "li" && sameTag(innerText(html, parent), innerText(html, element));
    const target = dropParent && parent ? parent : element;
    let end = target.end;
    if (charAt(html, end) === "\n") end += 1;
    ranges.push({ start: target.start, end, text: "" });
  }
  return ranges.length > 0 ? spliceRanges(html, ranges) : html;
}

function addAnchor(html: string, add: string): string {
  const elements = parseElements(html);
  if (
    elements.some(
      (element) =>
        element.name === "a" && isTagAnchor(element) && sameTag(innerText(html, element), add)
    )
  ) {
    return html;
  }
  const item = `<li><a rel="tag" href="/tags/${slugTag(add)}/">${escapeAttr(add.trim())}</a></li>`;
  const list = elements.find((element) => {
    if (element.name !== "ul" && element.name !== "ol") return false;
    return (attrValue(element, "class") ?? "").split(/\s+/).includes("tags");
  });
  if (list && list.closeStart > list.openEnd) {
    return html.slice(0, list.closeStart) + item + html.slice(list.closeStart);
  }
  const anchor = [...elements]
    .reverse()
    .find((element) => element.name === "a" && isTagAnchor(element));
  if (anchor) {
    const parent = anchor.parent >= 0 ? elements[anchor.parent] : undefined;
    const at = parent?.name === "li" ? parent.end : anchor.end;
    return html.slice(0, at) + item + html.slice(at);
  }
  const block = `<ul class="tags">${item}</ul>`;
  const article = html.toLowerCase().lastIndexOf("</article>");
  if (article >= 0) return html.slice(0, article) + block + html.slice(article);
  const body = html.toLowerCase().lastIndexOf("</body>");
  if (body >= 0) return html.slice(0, body) + block + html.slice(body);
  return html + block;
}

function escapeRegex(char: string): string {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char;
}

export function compilePattern(pattern: string): { glob: boolean; regex: RegExp } {
  if (!/[*?]/.test(pattern)) {
    return { glob: false, regex: new RegExp(pattern.replace(/[\\^$+?.()|[\]{}]/g, "\\$&")) };
  }
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.startsWith("**/", i)) {
      source += "(?:.*/)?";
      i += 2;
      continue;
    }
    if (pattern.startsWith("**", i)) {
      source += "(.*)";
      i += 1;
      continue;
    }
    const ch = charAt(pattern, i);
    if (ch === "*") source += "([^/]*)";
    else if (ch === "?") source += "([^/])";
    else source += escapeRegex(ch);
  }
  return { glob: true, regex: new RegExp(`^${source}$`) };
}

export function hrefMatchesPattern(href: string, pattern: string): boolean {
  const compiled = compilePattern(pattern);
  if (!compiled.glob) return href.includes(pattern);
  return compiled.regex.test(href);
}

export function rewriteHref(href: string, pattern: string, replacement: string): string | null {
  if (!hrefMatchesPattern(href, pattern)) return null;
  const compiled = compilePattern(pattern);
  const next = compiled.glob
    ? href.replace(compiled.regex, replacement)
    : href.replace(pattern, replacement);
  return next === href ? null : next;
}

export function pathMatchesGlob(path: string, glob: string): boolean {
  const normal = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const pattern = glob.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!/[*?]/.test(pattern)) return normal === pattern;
  return compilePattern(pattern).regex.test(normal);
}

export type FoundLink = { href: string; text: string };

export function linksIn(html: string): FoundLink[] {
  const links: FoundLink[] = [];
  for (const element of parseElements(html)) {
    const href = attrValue(element, "href");
    if (!href) continue;
    links.push({
      href,
      text: element.name === "a" ? innerText(html, element).slice(0, 120) : ""
    });
  }
  return links;
}

export function rewriteLinks(
  html: string,
  pattern: string,
  replacement: string
): { html: string; changes: { href: string; next: string }[] } {
  const edits: { start: number; end: number; text: string }[] = [];
  const changes: { href: string; next: string }[] = [];
  for (const element of parseElements(html)) {
    const attr = element.attrs.find((item) => item.name === "href");
    if (!attr) continue;
    const next = rewriteHref(attr.value, pattern, replacement);
    if (next === null) continue;
    edits.push({ start: attr.valueStart, end: attr.valueEnd, text: next });
    changes.push({ href: attr.value, next });
  }
  return { html: edits.length > 0 ? spliceRanges(html, edits) : html, changes };
}

export function safeHref(value: string): boolean {
  return value !== "" && !/[\s"'<>`]/.test(value);
}
