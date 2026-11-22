import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { SiteBuildError } from "./errors";

/**
 * Listing pages are generated into the build output from dated articles.
 *
 * Facts come from JSON-LD (`Article`, `NewsArticle`, `BlogPosting`: headline,
 * datePublished, articleSection, keywords, and description/image when present).
 * Missing fields fall back to `og:title`, `article:published_time`,
 * `article:section`, and `article:tag`. A page with no date is not listed.
 *
 * `.flagstage/listings.json` names the groups. Articles sort oldest first by
 * date, then url. Page 1 is the oldest page. The highest page is the newest
 * partial page, and the landing path shows that page. Within a page the newest
 * item is first, so a new article rewrites the newest page and the landing
 * instead of every page.
 *
 * The template is `_templates/listing.html` when it contains listing markers.
 * Otherwise a small default is used. Markers, in order:
 *
 * ```html
 * <!--#listing item -->...{{url}} {{headline}} {{heading}} {{text}}...<!--#listing /item -->
 * <!--#listing prev --><a rel="prev" href="{{prev}}">Previous</a><!--#listing /prev -->
 * <!--#listing next --><a rel="next" href="{{next}}">Next</a><!--#listing /next -->
 * ```
 *
 * `{{title}}` is the group title. `{{path}}` is the nav href passed to the
 * header include. `{{heading}}` and `{{text}}` match the placeholders the
 * importer writes into the listing template. Values are HTML-escaped.
 */

const LISTINGS_FILE = ".flagstage/listings.json";
const DEFAULT_TEMPLATE = "_templates/listing.html";
const DEFAULT_PAGE_SIZE = 24;
const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting"]);

interface ListingsConfig {
  pageSize: number;
  template: string;
  groups: ListingGroup[];
}

interface ListingGroup {
  id: string;
  match: "all" | "section" | "tag";
  output: string;
  landing: string;
  title: string;
  active?: string;
  pageSize?: number;
}

interface Article {
  url: string;
  time: number;
  date: string;
  headline: string;
  description: string;
  image: string;
  section: string;
  tags: string[];
}

interface Fields {
  headline: string;
  date: string;
  section: string;
  tags: string[];
  description: string;
  image: string;
}

export interface ListingFile {
  rel: string;
  html: string;
}

export function renderListings(sourceDir: string, pages: Map<string, string>): ListingFile[] {
  const config = readConfig(sourceDir);
  if (!config || config.groups.length === 0) return [];
  const articles = articlesFrom(pages);
  const template = loadTemplate(sourceDir, config.template);
  const files: ListingFile[] = [];
  const claimed = new Map<string, string>();
  for (const group of config.groups) {
    const size = group.pageSize ?? config.pageSize;
    for (const bucket of buckets(group, articles)) {
      const section = group.match === "section" ? slugify(bucket.label) : "";
      const tag = group.match === "tag" ? slugify(bucket.label) : "";
      const output = fillPattern(group.output, { section, tag });
      const landing = fillPattern(group.landing, { section, tag });
      if (!output.includes("{n}")) {
        throw new SiteBuildError(
          "bad-listings",
          `Group "${group.id}" output "${group.output}" must include {n}`
        );
      }
      if (landing.includes("{n}") || landing.includes("{")) {
        throw new SiteBuildError(
          "bad-listings",
          `Group "${group.id}" landing "${group.landing}" must be one file`
        );
      }
      const slices = paginate(bucket.articles, size, output);
      if (slices.length === 0) continue;
      const title = applyTitle(group.title, bucket.label, group.match);
      const active = group.active
        ? fillPattern(group.active, { section, tag })
        : activeFromLanding(landing);
      if (active.includes("{")) {
        throw new SiteBuildError(
          "bad-listings",
          `Group "${group.id}" active path "${active}" has an empty token`
        );
      }
      const rendered = slices.map((slice) =>
        renderTemplate(template, {
          title,
          path: active,
          page: slice.number,
          pages: slices.length,
          prev: slice.prev,
          next: slice.next,
          items: slice.items
        })
      );
      slices.forEach((slice, index) => {
        const path = output.replaceAll("{n}", String(slice.number));
        const html = rendered[index];
        if (html === undefined) return;
        writeListing(files, claimed, path, html, `${group.id} page ${slice.number}`);
      });
      const newest = rendered[rendered.length - 1];
      if (newest !== undefined) {
        writeListing(files, claimed, landing, newest, `${group.id} landing`);
      }
    }
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return files;
}

function readConfig(sourceDir: string): ListingsConfig | null {
  const abs = join(sourceDir, LISTINGS_FILE);
  if (!existsSync(abs)) return null;
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SiteBuildError("bad-listings", `Could not read ${LISTINGS_FILE}: ${detail}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new SiteBuildError("bad-listings", `${LISTINGS_FILE} is not valid JSON`);
  }
  const record = asRecord(parsed);
  if (!record) throw new SiteBuildError("bad-listings", `${LISTINGS_FILE} must be an object`);
  const pageSize = record.pageSize === undefined ? DEFAULT_PAGE_SIZE : pageSizeOf(record.pageSize);
  const template =
    record.template === undefined ? DEFAULT_TEMPLATE : stringField(record.template, "template");
  sourceFile(sourceDir, template);
  if (!Array.isArray(record.groups)) {
    throw new SiteBuildError("bad-listings", `${LISTINGS_FILE} is missing groups`);
  }
  const groups = record.groups.map((group, index) => readGroup(group, index));
  const ids = new Set<string>();
  for (const group of groups) {
    if (ids.has(group.id)) {
      throw new SiteBuildError("bad-listings", `Duplicate listing group "${group.id}"`);
    }
    ids.add(group.id);
    requireToken(group);
  }
  return { pageSize, template, groups };
}

function readGroup(value: unknown, index: number): ListingGroup {
  const record = asRecord(value);
  if (!record) {
    throw new SiteBuildError("bad-listings", `Listing group ${index + 1} must be an object`);
  }
  const id = record.id === undefined ? `group-${index + 1}` : stringField(record.id, "id");
  const match = record.match;
  if (match !== "all" && match !== "section" && match !== "tag") {
    throw new SiteBuildError(
      "bad-listings",
      `Listing group "${id}" match must be all, section, or tag`
    );
  }
  const output = stringField(record.output, `${id} output`);
  const landing = stringField(record.landing, `${id} landing`);
  const title =
    record.title === undefined ? defaultTitle(match) : stringField(record.title, `${id} title`);
  const group: ListingGroup = { id, match, output, landing, title };
  if (record.active !== undefined) group.active = stringField(record.active, `${id} active`);
  if (record.pageSize !== undefined) group.pageSize = pageSizeOf(record.pageSize);
  return group;
}

function defaultTitle(match: ListingGroup["match"]): string {
  if (match === "section") return "{section}";
  if (match === "tag") return "{tag}";
  return "News";
}

function requireToken(group: ListingGroup): void {
  const token = group.match === "section" ? "{section}" : group.match === "tag" ? "{tag}" : "";
  if (!token) return;
  if (!group.output.includes(token) || !group.landing.includes(token)) {
    throw new SiteBuildError(
      "bad-listings",
      `Listing group "${group.id}" paths must include ${token}`
    );
  }
}

function pageSizeOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new SiteBuildError("bad-listings", "Listing pageSize must be a positive integer");
  }
  return value;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SiteBuildError("bad-listings", `Listing ${label} must be a string`);
  }
  return value;
}

function articlesFrom(pages: Map<string, string>): Article[] {
  const articles: Article[] = [];
  for (const [rel, html] of pages) {
    if (!isHtml(rel)) continue;
    const article = articleFrom(rel, html);
    if (article) articles.push(article);
  }
  articles.sort((a, b) => a.time - b.time || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  return articles;
}

function articleFrom(rel: string, html: string): Article | null {
  const ld = jsonLdFields(html);
  const meta = metaFields(html);
  const date = ld?.date || meta.date;
  const time = date ? publishedTime(date) : null;
  if (!date || time === null) return null;
  const tags = ld && ld.tags.length > 0 ? ld.tags : meta.tags;
  return {
    url: publicUrl(rel),
    time,
    date: date.trim(),
    headline: ld?.headline || meta.headline,
    description: ld?.description || "",
    image: ld?.image || "",
    section: ld?.section || meta.section,
    tags
  };
}

function jsonLdFields(html: string): Fields | null {
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    const attrs = readAttributes(script[1] ?? "");
    const type = (attrs.get("type") ?? "").toLowerCase();
    if (type !== "application/ld+json") continue;
    const article = firstArticle(parseJsonLd(script[2] ?? ""));
    if (!article) continue;
    const keywords = keywordList(article.keywords);
    return {
      headline: textValue(article.headline),
      date: textValue(article.datePublished),
      section: textValue(article.articleSection),
      tags: keywords,
      description: textValue(article.description),
      image: imageValue(article.image)
    };
  }
  return null;
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

function firstArticle(value: unknown): Record<string, unknown> | null {
  const found: Record<string, unknown>[] = [];
  collectArticles(value, found);
  return found[0] ?? null;
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

function isArticleType(type: string): boolean {
  const name = type.includes("/") ? type.slice(type.lastIndexOf("/") + 1) : type;
  return ARTICLE_TYPES.has(name);
}

function typeNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function keywordList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => decodeEntities(item).trim())
      .filter((item) => item !== "");
  }
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item === "string") tags.push(...keywordList(item));
  }
  return tags;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? decodeEntities(value).trim() : "";
}

function imageValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageValue(item);
      if (found) return found;
    }
    return "";
  }
  const record = asRecord(value);
  if (!record) return "";
  return textValue(record.url);
}

function metaFields(html: string): Fields {
  const fields: Fields = {
    headline: "",
    date: "",
    section: "",
    tags: [],
    description: "",
    image: ""
  };
  for (const tag of html.matchAll(/<meta\b([^>]*?)\/?>/gi)) {
    const attrs = readAttributes(tag[1] ?? "");
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
    const content = attrs.get("content") ?? "";
    if (!key || !content) continue;
    if (key === "og:title" && !fields.headline) fields.headline = content;
    else if (key === "article:published_time" && !fields.date) fields.date = content;
    else if (key === "article:section" && !fields.section) fields.section = content;
    else if (key === "article:tag") fields.tags.push(content);
  }
  return fields;
}

function readAttributes(raw: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const pattern = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of raw.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name || attrs.has(name)) continue;
    attrs.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attrs;
}

function publishedTime(value: string): number | null {
  const trimmed = value.trim();
  let parsed: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) parsed = Date.parse(`${trimmed}T00:00:00Z`);
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(trimmed)) {
    parsed = Date.parse(`${trimmed}Z`);
  } else parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicUrl(rel: string): string {
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.slice(0, -"index.html".length)}`;
  return `/${rel}`;
}

function activeFromLanding(landing: string): string {
  const key = outputKey(landing, "landing");
  const url = publicUrl(key);
  if (!url.endsWith("/")) return url;
  const trimmed = url.slice(0, -1);
  return trimmed === "" ? "/" : trimmed;
}

interface Bucket {
  label: string;
  articles: Article[];
}

function buckets(group: ListingGroup, articles: Article[]): Bucket[] {
  if (group.match === "all") return [{ label: "", articles }];
  const map = new Map<string, Bucket>();
  for (const article of articles) {
    const labels =
      group.match === "section" ? (article.section ? [article.section] : []) : article.tags;
    for (const label of labels) {
      const key = slugify(label);
      const found = map.get(key);
      if (found) found.articles.push(article);
      else map.set(key, { label, articles: [article] });
    }
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, bucket]) => bucket);
}

interface Slice {
  number: number;
  items: Article[];
  prev: string;
  next: string;
}

function paginate(articles: Article[], pageSize: number, output: string): Slice[] {
  const total = Math.ceil(articles.length / pageSize);
  const paths: string[] = [];
  for (let number = 1; number <= total; number += 1) {
    paths.push(output.replaceAll("{n}", String(number)));
  }
  const slices: Slice[] = [];
  for (let index = 0; index < total; index += 1) {
    const chunk = articles.slice(index * pageSize, (index + 1) * pageSize);
    slices.push({
      number: index + 1,
      items: [...chunk].reverse(),
      prev: paths[index - 1] ?? "",
      next: paths[index + 1] ?? ""
    });
  }
  return slices;
}

function fillPattern(pattern: string, vars: { section: string; tag: string }): string {
  return pattern.replaceAll("{section}", vars.section).replaceAll("{tag}", vars.tag);
}

function applyTitle(template: string, label: string, match: ListingGroup["match"]): string {
  if (match === "all") return template;
  return template.replaceAll("{section}", label).replaceAll("{tag}", label);
}

function writeListing(
  files: ListingFile[],
  claimed: Map<string, string>,
  sitePath: string,
  html: string,
  owner: string
): void {
  const rel = outputKey(sitePath, owner);
  const previous = claimed.get(rel);
  if (previous !== undefined) {
    throw new SiteBuildError(
      "bad-listings",
      `Listing path "${rel}" is used by ${previous} and ${owner}`
    );
  }
  claimed.set(rel, owner);
  if (/<!--#listing\b/.test(html)) {
    throw new SiteBuildError("bad-listings", `Listing template left an unclosed block in ${rel}`);
  }
  files.push({ rel, html });
}

function outputKey(sitePath: string, owner: string): string {
  if (
    !sitePath.startsWith("/") ||
    sitePath.includes("\\") ||
    sitePath.includes("\0") ||
    sitePath.includes("{")
  ) {
    throw new SiteBuildError(
      "bad-listings",
      `Listing path "${sitePath}" (${owner}) is not a site path`
    );
  }
  const parts = sitePath.slice(1).split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new SiteBuildError(
      "bad-listings",
      `Listing path "${sitePath}" (${owner}) is not a safe file`
    );
  }
  const key = parts.join("/");
  if (!key.endsWith(".html") && !key.endsWith(".htm")) {
    throw new SiteBuildError(
      "bad-listings",
      `Listing path "${sitePath}" (${owner}) must be an HTML file`
    );
  }
  return key;
}

interface RenderInput {
  title: string;
  path: string;
  page: number;
  pages: number;
  prev: string;
  next: string;
  items: Article[];
}

function renderTemplate(template: string, input: RenderInput): string {
  const prev = input.page > 1 ? input.prev : "";
  const next = input.page < input.pages ? input.next : "";
  const shell = {
    title: escapeHtml(input.title),
    path: escapeHtml(input.path),
    page: String(input.page),
    pages: String(input.pages),
    prev: escapeHtml(prev),
    next: escapeHtml(next)
  };
  let html = replaceBlock(template, "item", (inner) =>
    input.items.map((item) => fill(inner, { ...shell, ...itemValues(item) })).join("")
  );
  html = replaceBlock(html, "prev", (inner) => (prev ? fill(inner, shell) : ""));
  html = replaceBlock(html, "next", (inner) => (next ? fill(inner, shell) : ""));
  return fill(html, shell);
}

function itemValues(item: Article): Record<string, string> {
  const headline = escapeHtml(item.headline);
  const description = escapeHtml(item.description);
  return {
    url: escapeHtml(item.url),
    headline,
    heading: headline,
    description,
    text: description,
    date: escapeHtml(item.date),
    section: escapeHtml(item.section),
    image: escapeHtml(item.image),
    keywords: escapeHtml(item.tags.join(", "))
  };
}

function replaceBlock(html: string, name: string, render: (inner: string) => string): string {
  const pattern = new RegExp(
    `<!--#listing\\s+${name}\\s*-->([\\s\\S]*?)<!--#listing\\s+/${name}\\s*-->`,
    "g"
  );
  return html.replace(pattern, (_whole, inner: string) => render(inner));
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z]+)\}\}/g, (whole, key: string) => {
    const value = values[key];
    return value === undefined ? whole : value;
  });
}

function loadTemplate(sourceDir: string, rel: string): string {
  const abs = sourceFile(sourceDir, rel);
  if (abs && existsSync(abs)) {
    let info;
    try {
      info = statSync(abs);
    } catch {
      info = undefined;
    }
    if (!info?.isFile()) {
      throw new SiteBuildError("bad-listings", `Listing template "${rel}" is not a file`);
    }
    const text = readFileSync(abs, "utf8");
    if (/<!--#listing\s+item\s*-->/.test(text)) return text;
  }
  return defaultTemplate(sourceDir);
}

function sourceFile(sourceDir: string, rel: string): string | null {
  if (rel.startsWith("/") || rel.includes("\\") || rel.includes("\0")) {
    throw new SiteBuildError("bad-listings", `Listing template "${rel}" must stay inside the site`);
  }
  const parts = rel.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new SiteBuildError("bad-listings", `Listing template "${rel}" must stay inside the site`);
  }
  return join(sourceDir, rel);
}

function defaultTemplate(sourceDir: string): string {
  const header = existsSync(join(sourceDir, "_inc", "header.html"))
    ? '<!--#include virtual="/_inc/header.html" active="{{path}}" -->\n'
    : "";
  const footer = existsSync(join(sourceDir, "_inc", "footer.html"))
    ? '<!--#include virtual="/_inc/footer.html" -->\n'
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{title}}</title>
</head>
<body>
${header}<main>
<h1>{{title}}</h1>
<ul>
<!--#listing item -->
<li><a href="{{url}}">{{headline}}</a> <time datetime="{{date}}">{{date}}</time></li>
<!--#listing /item -->
</ul>
<nav class="pager">
<!--#listing prev -->
<a rel="prev" href="{{prev}}">Previous</a>
<!--#listing /prev -->
<!--#listing next -->
<a rel="next" href="{{next}}">Next</a>
<!--#listing /next -->
</nav>
</main>
${footer}</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body === "amp") return "&";
    if (body === "lt") return "<";
    if (body === "gt") return ">";
    if (body === "quot") return '"';
    if (body === "apos") return "'";
    if (body.startsWith("#x")) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return whole;
  });
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isHtml(rel: string): boolean {
  const lower = rel.toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm");
}
