import type { ListingDecide, ListingDecision, ListingSummary } from "@flagstage/ai";
import { DEFAULT_DECISION_CONFIDENCE_THRESHOLD } from "@flagstage/config";

import type { FidelityItem, RedirectRule } from "./types";

/**
 * Measure crawled listing pages and turn them into `.flagstage/listings.json`
 * plus a listing template taken from the real item card and pager.
 *
 * A listing page is one whose content mostly links to dated articles. Paginated
 * siblings share a URL pattern (`/news/page/N/`, `/news/N`, `?page=N`). Page
 * size is the mode of the full pages. Oldest-first URLs are reused. Newest-first
 * numbered URLs would show different articles, so they become 301s to the
 * landing page (or to the generated page when the old URL cannot be a file).
 *
 * When the measurements disagree, `decide` is called. The reply is kept only
 * when it matches a size and a selector we actually saw. Otherwise the
 * deterministic guess is used. Low-confidence results are returned as notes.
 */

const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting"]);
const CHROME = new Set(["header", "nav", "footer"]);
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

const FALLBACK_PAGER = [
  '<nav class="pager">',
  "<!--#listing prev -->",
  '<a rel="prev" href="{{prev}}">Previous</a>',
  "<!--#listing /prev -->",
  "<!--#listing next -->",
  '<a rel="next" href="{{next}}">Next</a>',
  "<!--#listing /next -->",
  "</nav>"
].join("\n");

export interface ListingSourcePage {
  path: string;
  html: string;
}

export interface ListingOptions {
  decide?: ListingDecide;
  /** A kept reply below this is still a low-confidence note. */
  confidenceThreshold?: number;
}

export interface ListingPlan {
  configJson: string | null;
  templateHtml: string | null;
  removePaths: string[];
  redirects: RedirectRule[];
  notes: FidelityItem[];
}

interface Facts {
  time: number;
  section: string;
  tags: string[];
}

interface Article extends Facts {
  path: string;
}

interface El {
  tag: string;
  start: number;
  end: number;
  className: string;
  href: string;
  hrefStart: number;
  hrefEnd: number;
  rel: string;
  children: El[];
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

interface Edit {
  start: number;
  end: number;
  text: string;
}

type PatternKind = "page-dir" | "page-file" | "num-dir" | "num-file" | "query";
type Order = "newest-first" | "oldest-first";
type GroupName = "all" | "section" | "tag";

interface Pattern {
  kind: PatternKind;
  prefix: string;
  number: number;
}

interface Pager {
  prev: El | null;
  next: El | null;
  drops: El[];
}

interface FamilyPage {
  path: string;
  html: string;
  root: El;
  number: number;
  count: number;
  stamp: number;
  run: El[];
  selector: string;
  pager: Pager;
  linked: Article[];
}

interface GroupChoice {
  group: GroupName;
  label: string;
  clear: boolean;
}

interface Measured {
  pages: FamilyPage[];
  pattern: Pattern;
  order: Order;
  orderKnown: boolean;
  group: GroupChoice;
  pageSize: number;
  selector: string;
  seenSizes: number[];
  low: boolean;
  reason: string;
  example: FamilyPage;
}

interface GroupFile {
  id: string;
  match: GroupName;
  title: string;
  output: string;
  landing: string;
  active: string;
  pageSize: number;
}

export async function analyzeListings(
  pages: ListingSourcePage[],
  options: ListingOptions = {}
): Promise<ListingPlan> {
  const empty: ListingPlan = {
    configJson: null,
    templateHtml: null,
    removePaths: [],
    redirects: [],
    notes: []
  };
  const articles = indexArticles(pages);
  if (articles.list.length === 0) return empty;

  const parsed: FamilyPage[] = [];
  const listingLike: string[] = [];
  for (const page of pages) {
    const found = inspect(page, articles.byUrl);
    if (!found) continue;
    listingLike.push(page.path);
    if (found.page.number >= 0) parsed.push(found.page);
  }

  const families = cluster(parsed);
  const measured: Measured[] = [];
  for (const family of families) {
    const result = await measure(family, articles.list, options);
    if (result) measured.push(result);
  }
  if (measured.length === 0) {
    return { ...empty, notes: uncovered(listingLike, new Set()) };
  }

  const remove = new Set<string>();
  const redirects: RedirectRule[] = [];
  const notes: FidelityItem[] = [];
  const groups: GroupFile[] = [];
  let templateHtml: string | null = null;
  let templateScore = -1;

  const usedIds = new Set<string>();
  const sectionFamilies = measured.filter((family) => family.group.group === "section");
  const tagFamilies = measured.filter((family) => family.group.group === "tag");
  const allFamilies = measured.filter((family) => family.group.group === "all");

  for (const family of allFamilies) {
    const built = emitFamily(family, null, usedIds);
    groups.push(built.group);
    for (const path of built.remove) remove.add(path);
    redirects.push(...built.redirects);
    if (family.low) notes.push(lowNote(family));
    if (built.score > templateScore) {
      templateScore = built.score;
      templateHtml = built.template;
    }
  }
  for (const batch of [sectionFamilies, tagFamilies]) {
    if (batch.length === 0) continue;
    const sample = [...batch].sort((a, b) => b.pages.length - a.pages.length)[0];
    if (!sample) continue;
    const token = sample.group.group === "section" ? "{section}" : "{tag}";
    const built = emitFamily(sample, token, usedIds);
    const sizes = batch.map((family) => family.pageSize);
    built.group.pageSize = mode(sizes);
    if (new Set(sizes).size > 1) {
      sample.low = true;
      sample.reason = sample.reason || "Page sizes differ across lists in this group.";
    }
    groups.push(built.group);
    for (const family of batch) {
      const one = emitFamily(family, token, new Set(usedIds));
      for (const path of one.remove) remove.add(path);
      redirects.push(...one.redirects);
      if (family.low) notes.push(lowNote(family));
    }
    if (built.score > templateScore) {
      templateScore = built.score;
      templateHtml = built.template;
    }
  }

  notes.push(...uncovered(listingLike, remove));
  notes.sort((a, b) => a.page.localeCompare(b.page) || a.detail.localeCompare(b.detail));
  const pageSize = groups[0]?.pageSize ?? 24;
  return {
    configJson: `${JSON.stringify(
      { pageSize, template: "_templates/listing.html", groups },
      null,
      2
    )}\n`,
    templateHtml,
    removePaths: [...remove].sort(),
    redirects: dedupeRedirects(redirects),
    notes
  };
}

function uncovered(paths: string[], remove: Set<string>): FidelityItem[] {
  return paths
    .filter((path) => !remove.has(path))
    .sort()
    .map((page) => ({
      page,
      kind: "listing",
      detail: "Listing page was not covered by a generated group and was kept."
    }));
}

function lowNote(family: Measured): FidelityItem {
  const page = family.example.path;
  return {
    page,
    kind: "listing",
    detail:
      `Low-confidence listing decision for ${page}: page size ${family.pageSize}, selector ${family.selector}. ${family.reason}`.trim()
  };
}

function emitFamily(
  family: Measured,
  token: "{section}" | "{tag}" | null,
  usedIds: Set<string>
): {
  group: GroupFile;
  remove: string[];
  redirects: RedirectRule[];
  template: string;
  score: number;
} {
  const prefix = token ? withToken(family.pattern.prefix, token) : family.pattern.prefix;
  const paths = pathsFor({ ...family.pattern, prefix }, family.order);
  const concrete = pathsFor(family.pattern, family.order);
  const landingPublic = siteUrl(paths.landing.replace(/^\//, ""));
  const redirects: RedirectRule[] = [];
  const remove: string[] = [];
  for (const page of family.pages) {
    remove.push(page.path);
    const from = siteUrl(page.path);
    const generated =
      page.number >= 1
        ? siteUrl(concrete.output.replaceAll("{n}", String(page.number)).replace(/^\//, ""))
        : landingPublic;
    const to = family.order === "newest-first" ? landingPublic : generated;
    if (!sameUrl(from, to)) {
      redirects.push({ fromPath: from, toPath: to, source: "listing" });
    }
  }
  const id = uniqueId(token ? token.slice(1, -1) : groupId(family.pattern.prefix), usedIds);
  const title =
    family.group.group === "section"
      ? "{section}"
      : family.group.group === "tag"
        ? "{tag}"
        : h1Text(family.example.html);
  const run = runForSelector(family.example, family.selector) ?? family.example.run;
  const template = ensurePager(buildTemplate(family.example.html, run, family.example.pager));
  return {
    group: {
      id,
      match: family.group.group,
      title,
      output: paths.output,
      landing: paths.landing,
      active: prefix ? `/${prefix}` : "/",
      pageSize: family.pageSize
    },
    remove,
    redirects,
    template,
    score: family.pages.reduce((sum, page) => sum + page.linked.length, 0)
  };
}

function uniqueId(base: string, used: Set<string>): string {
  const root = base || "all";
  let id = root;
  let n = 2;
  while (used.has(id)) {
    id = `${root}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function groupId(prefix: string): string {
  const last = prefix.split("/").filter(Boolean).pop() ?? "all";
  return slugify(last) || "all";
}

function withToken(prefix: string, token: string): string {
  const parts = prefix.split("/");
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) return token;
  parts[parts.length - 1] = token;
  return parts.join("/");
}

function pathsFor(pattern: Pattern, order: Order): { output: string; landing: string } {
  const root = pattern.prefix ? `/${pattern.prefix}` : "";
  const landing = `${root}/index.html`;
  const reusable = order === "oldest-first" && pattern.kind !== "query";
  if (!reusable) return { output: `${root}/page/{n}.html`, landing };
  if (pattern.kind === "page-dir") return { output: `${root}/page/{n}/index.html`, landing };
  if (pattern.kind === "page-file") return { output: `${root}/page/{n}.html`, landing };
  if (pattern.kind === "num-dir") return { output: `${root}/{n}/index.html`, landing };
  return { output: `${root}/{n}.html`, landing };
}

async function measure(
  pages: FamilyPage[],
  articles: Article[],
  options: ListingOptions
): Promise<Measured | null> {
  if (pages.length < 2) return null;
  assignNumbers(pages);
  const pattern = pages.map((page) => patternOf(page.path)).find((item) => item !== null) ?? null;
  if (!pattern) return null;
  const seenSizes = pages.map((page) => page.count);
  const pageSize = mode(splitFull(seenSizes).full);
  const order = readOrder(pages);
  const linked = uniqueArticles(pages.flatMap((page) => page.linked));
  const group = chooseGroup(linked, articles);
  const example = chooseExample(pages, pageSize);
  const candidates = selectorCandidates(example);
  const patterns = patternKeys(pages, pattern);
  const sizeAgree = new Set(splitFull(seenSizes).full).size <= 1;
  const confident =
    sizeAgree &&
    order.known &&
    !selectorsCompete(candidates) &&
    patterns.length <= 1 &&
    group.clear;
  const decide = options.decide;
  const threshold = options.confidenceThreshold ?? DEFAULT_DECISION_CONFIDENCE_THRESHOLD;
  const guess: Measured = {
    pages,
    pattern,
    order: order.value,
    orderKnown: order.known,
    group,
    pageSize,
    selector: example.selector,
    seenSizes,
    low: !confident,
    reason: confident ? "" : "Measurements disagreed.",
    example
  };
  if (confident || !decide) return guess;

  const summary: ListingSummary = {
    candidateSelectors: candidates,
    pageSizes: [...new Set(seenSizes)].sort((a, b) => a - b),
    urlSamples: pages.map((page) => siteUrl(page.path)).sort(),
    sampleItemHtml: sampleItem(example)
  };
  try {
    const decision = await decide(summary);
    if (!decision) return guess;
    if (!accepts(decision, guess, pages)) {
      guess.reason = "The listing model reply did not match the measurements.";
      return guess;
    }
    guess.pageSize = decision.pageSize;
    guess.selector = decision.itemSelector;
    if (!guess.orderKnown) guess.order = decision.order;
    if (!guess.group.clear) {
      guess.group = { group: decision.group, label: guess.group.label, clear: false };
    }
    guess.low = decision.confidence < threshold;
    guess.reason = decision.reason;
    return guess;
  } catch {
    guess.reason = "The listing model was unavailable.";
    return guess;
  }
}

function accepts(decision: ListingDecision, guess: Measured, pages: FamilyPage[]): boolean {
  if (!reasonableSize(decision.pageSize, guess.seenSizes)) return false;
  if (guess.orderKnown && decision.order !== guess.order) return false;
  if (guess.group.clear && decision.group !== guess.group.group) return false;
  if (!selectorOk(decision.itemSelector, guess.selector, pages)) return false;
  const expected = patternKey(guess.pattern);
  if (
    decision.urlPattern !== expected &&
    !fitsSamples(
      decision.urlPattern,
      pages.map((page) => siteUrl(page.path))
    )
  ) {
    return false;
  }
  return true;
}

function reasonableSize(value: number, seen: number[]): boolean {
  if (!Number.isInteger(value) || value < 1 || seen.length === 0) return false;
  if (seen.includes(value)) return true;
  return value >= Math.min(...seen) && value <= Math.max(...seen);
}

function selectorOk(selector: string, primary: string, pages: FamilyPage[]): boolean {
  if (selector === primary) return true;
  let hits = 0;
  for (const page of pages) {
    const run = runForSelector(page, selector);
    if (run && run.length >= 2) hits += run.length;
  }
  return hits >= 2;
}

function fitsSamples(pattern: string, samples: string[]): boolean {
  const body = pattern
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{n\\\}/g, "\\d+");
  let rx: RegExp;
  try {
    rx = new RegExp(`^${body}$`);
  } catch {
    return false;
  }
  const numbered = samples.filter((sample) => /\d/.test(sample));
  const hits = numbered.filter((sample) => rx.test(sample) || rx.test(sample.replace(/\/$/, "")));
  return hits.length > 0 && hits.length >= Math.min(2, numbered.length);
}

function patternKeys(pages: FamilyPage[], pattern: Pattern): string[] {
  const own = patternKey(pattern);
  const keys = new Set<string>([own]);
  const root = pattern.prefix ? `/${pattern.prefix}` : "/";
  for (const page of pages) {
    for (const href of page.html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const key = patternKeyFromHref(href[1] ?? href[2] ?? "");
      if (!key || key === own) continue;
      if (key.startsWith(`${root}/`) || key.startsWith(`${root}?`) || key.includes("?page="))
        keys.add(key);
    }
  }
  return [...keys];
}

function patternKey(pattern: Pattern): string {
  const root = pattern.prefix ? `/${pattern.prefix}` : "";
  if (pattern.kind === "query") return `${root}/?page={n}`;
  if (pattern.kind === "page-dir") return `${root}/page/{n}/`;
  if (pattern.kind === "page-file") return `${root}/page/{n}.html`;
  if (pattern.kind === "num-dir") return `${root}/{n}/`;
  return `${root}/{n}.html`;
}

function patternKeyFromHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, "https://site.invalid");
  } catch {
    return null;
  }
  if (/[?&]page=\d+/i.test(url.search)) {
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return `${path}?page={n}`;
  }
  const path = url.pathname;
  if (/\/page\/\d+\.html$/i.test(path)) return path.replace(/\/\d+\.html$/i, "/{n}.html");
  if (/\/page\/\d+\/?$/i.test(path)) return path.replace(/\/\d+\/?$/i, "/{n}/");
  if (/\/\d+\.html$/i.test(path)) return path.replace(/\/\d+\.html$/i, "/{n}.html");
  if (/\/\d+\/?$/i.test(path)) return path.replace(/\/\d+\/?$/i, "/{n}/");
  return null;
}

function selectorsCompete(candidates: { selector: string; count: number }[]): boolean {
  const first = candidates[0];
  const second = candidates[1];
  if (!first || !second || first.count === second.count) return false;
  return second.count >= first.count * 0.5;
}

function selectorCandidates(page: FamilyPage): { selector: string; count: number }[] {
  const counts = new Map<string, number>();
  walk(page.root, (el) => {
    if (inChrome(el, page.root)) return;
    const selector = selectorOf(el);
    counts.set(selector, (counts.get(selector) ?? 0) + 1);
  });
  counts.set(page.selector, Math.max(counts.get(page.selector) ?? 0, page.count));
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([selector, count]) => ({ selector, count }));
}

function sampleItem(page: FamilyPage): string {
  const item = page.run[0];
  if (!item) return "";
  return page.html.slice(item.start, item.end).replace(/\s+/g, " ").trim().slice(0, 500);
}

function chooseExample(pages: FamilyPage[], pageSize: number): FamilyPage {
  const both = pages.find((page) => page.pager.prev && page.pager.next);
  if (both) return both;
  return pages.find((page) => page.count === pageSize) ?? pages[0]!;
}

function readOrder(pages: FamilyPage[]): { value: Order; known: boolean } {
  const ordered = pages.filter((page) => page.number >= 1).sort((a, b) => a.number - b.number);
  let newer = 0;
  let older = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const prev = ordered[index - 1];
    const current = ordered[index];
    if (!prev || !current || prev.stamp === current.stamp) continue;
    if (prev.stamp > current.stamp) newer += 1;
    else older += 1;
  }
  if (newer > older) return { value: "newest-first", known: true };
  if (older > newer) return { value: "oldest-first", known: true };
  return { value: "newest-first", known: false };
}

function chooseGroup(linked: Article[], articles: Article[]): GroupChoice {
  const ratio = articles.length === 0 ? 0 : linked.length / articles.length;
  if (ratio >= 0.75) return { group: "all", label: "", clear: true };
  const sections = [...new Set(linked.map((article) => article.section).filter(Boolean))];
  if (sections.length === 1 && sections[0]) {
    return { group: "section", label: sections[0], clear: true };
  }
  const tags = tagsOnEvery(linked);
  const specific = tags.filter((tag) => !articles.every((article) => article.tags.includes(tag)));
  const tag = specific[0] ?? tags[0];
  if (tag) return { group: "tag", label: tag, clear: specific.length === 1 };
  return { group: "all", label: "", clear: false };
}

function tagsOnEvery(articles: Article[]): string[] {
  const first = articles[0];
  if (!first) return [];
  return first.tags.filter((tag) => articles.every((article) => article.tags.includes(tag)));
}

function assignNumbers(pages: FamilyPage[]): void {
  const numbers = new Set(pages.map((page) => page.number).filter((number) => number >= 1));
  if (numbers.has(1)) return;
  for (const page of pages) {
    if (page.number === 0) page.number = 1;
  }
}

function cluster(pages: FamilyPage[]): FamilyPage[][] {
  const groups = new Map<string, FamilyPage[]>();
  for (const page of pages) {
    const pattern = patternOf(page.path);
    if (!pattern || page.number < 1) continue;
    const key = `${pattern.kind}\0${pattern.prefix}\0${page.selector}`;
    const list = groups.get(key);
    if (list) list.push(page);
    else groups.set(key, [page]);
  }
  const families: FamilyPage[][] = [];
  for (const [key, numbered] of groups) {
    const prefix = key.split("\0")[1] ?? "";
    const selector = key.split("\0")[2] ?? "";
    const landing = pages.find(
      (page) =>
        page.number === 0 && landingPrefix(page.path) === prefix && page.selector === selector
    );
    const family = landing ? [landing, ...numbered] : numbered;
    if (family.length >= 2) families.push(family);
  }
  return families;
}

function inspect(
  page: ListingSourcePage,
  byUrl: Map<string, Article>
): { page: FamilyPage; pattern: Pattern | null } | null {
  const html = neutralize(page.html);
  const root = parseHtml(html);
  const runs: El[][] = [];
  collectRuns(root, byUrl, runs);
  const run = runs.sort((a, b) => b.length - a.length)[0];
  if (!run || run.length < 2) return null;
  const linked = contentLinks(root, byUrl);
  if (linked.length < 2) return null;
  const anchors = contentAnchors(root);
  if (anchors === 0 || linked.length / anchors < 0.6) return null;
  const first = run[0];
  if (!first) return null;
  const pattern = patternOf(page.path);
  const number = pattern?.number ?? (landingPrefix(page.path) !== null ? 0 : -1);
  const familyPage: FamilyPage = {
    path: page.path,
    html,
    root,
    number,
    count: run.length,
    stamp: linked.reduce((max, article) => Math.max(max, article.time), 0),
    run,
    selector: selectorOf(first),
    pager: findPager(root, html, number),
    linked
  };
  if (number < 0) return { page: familyPage, pattern: null };
  return { page: familyPage, pattern };
}

function contentLinks(root: El, byUrl: Map<string, Article>): Article[] {
  const found: Article[] = [];
  const seen = new Set<string>();
  walk(root, (el) => {
    if (el.tag !== "a" || inChrome(el, root) || !el.href) return;
    const article = lookup(el.href, byUrl);
    if (!article || seen.has(article.path)) return;
    seen.add(article.path);
    found.push(article);
  });
  return found;
}

function contentAnchors(root: El): number {
  let count = 0;
  walk(root, (el) => {
    if (el.tag === "a" && el.href && !inChrome(el, root)) count += 1;
  });
  return count;
}

function collectRuns(el: El, byUrl: Map<string, Article>, runs: El[][]): void {
  if (CHROME.has(el.tag)) return;
  let index = 0;
  while (index < el.children.length) {
    const child = el.children[index];
    if (!child) break;
    const sig = signature(child);
    let next = index + 1;
    while (next < el.children.length) {
      const sibling = el.children[next];
      if (!sibling || signature(sibling) !== sig) break;
      next += 1;
    }
    const run = el.children.slice(index, next);
    if (run.length >= 2 && run.every((item) => hasArticleLink(item, byUrl))) runs.push(run);
    index = next;
  }
  for (const child of el.children) collectRuns(child, byUrl, runs);
}

function hasArticleLink(el: El, byUrl: Map<string, Article>): boolean {
  if (el.tag === "a" && lookup(el.href, byUrl)) return true;
  return el.children.some((child) => hasArticleLink(child, byUrl));
}

function signature(el: El): string {
  const kids = el.children.map((child) => signature(child)).join(",");
  return `${selectorOf(el)}(${kids})`;
}

function selectorOf(el: El): string {
  const cls = el.className.split(/\s+/).filter(Boolean)[0];
  return cls ? `${el.tag}.${cls}` : el.tag;
}

function runForSelector(page: FamilyPage, selector: string): El[] | null {
  if (selector === page.selector) return page.run;
  let best: El[] | null = null;
  const visit = (el: El) => {
    if (CHROME.has(el.tag)) return;
    let index = 0;
    while (index < el.children.length) {
      const child = el.children[index];
      if (!child) break;
      if (!matches(child, selector)) {
        index += 1;
        continue;
      }
      let next = index + 1;
      while (
        next < el.children.length &&
        el.children[next] &&
        matches(el.children[next]!, selector)
      ) {
        next += 1;
      }
      const run = el.children.slice(index, next);
      if (run.length >= 2 && (!best || run.length > best.length)) best = run;
      index = next;
    }
    for (const child of el.children) visit(child);
  };
  visit(page.root);
  return best;
}

function matches(el: El, selector: string): boolean {
  const dotted = selector.startsWith(".");
  const parts = selector.split(".").filter(Boolean);
  const tag = dotted ? "" : (parts[0] ?? "");
  const classes = dotted ? parts : parts.slice(1);
  if (tag && el.tag !== tag) return false;
  const have = new Set(el.className.split(/\s+/).filter(Boolean));
  return classes.every((name) => have.has(name));
}

function findPager(root: El, html: string, current: number): Pager {
  const pager: Pager = { prev: null, next: null, drops: [] };
  walk(root, (el) => {
    if (el.tag !== "a" || !el.href) return;
    const role = pagerRole(el, html, current);
    if (role === "prev" && !pager.prev) pager.prev = el;
    else if (role === "next" && !pager.next) pager.next = el;
    else if (role === "drop") pager.drops.push(el);
  });
  return pager;
}

function pagerRole(el: El, html: string, current: number): "prev" | "next" | "drop" | null {
  const text = html
    .slice(el.start, el.end)
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  if (/older|previous|\bprev\b|«|‹/.test(text)) return "prev";
  if (/newer|\bnext\b|»|›/.test(text)) return "next";
  const rel = el.rel.toLowerCase();
  if (/\bprev\b/.test(rel)) return "prev";
  if (/\bnext\b/.test(rel)) return "next";
  const number = numberFromHref(el.href);
  if (number === null) return null;
  if (current >= 1 && number === current - 1) return "prev";
  if (current >= 1 && number === current + 1) return "next";
  return "drop";
}

function numberFromHref(href: string): number | null {
  const query = href.match(/[?&]page=(\d+)/i);
  if (query) return Number(query[1]);
  const path = href.match(/\/(?:page\/)?(\d+)\/?(?:\.html)?(?:$|\?)/i);
  if (!path) return null;
  return Number(path[1]);
}

function patternOf(path: string): Pattern | null {
  const query = path.match(/^(.*?)\?page=(\d+)$/i);
  if (query) {
    const file = query[1] ?? "";
    const prefix = file.replace(/\/index\.html$/i, "").replace(/\.html$/i, "");
    return { kind: "query", prefix, number: Number(query[2]) };
  }
  let match = path.match(/^(.*)\/page\/(\d+)\/index\.html$/i);
  if (match) return { kind: "page-dir", prefix: match[1] ?? "", number: Number(match[2]) };
  match = path.match(/^(.*)\/page\/(\d+)\.html$/i);
  if (match) return { kind: "page-file", prefix: match[1] ?? "", number: Number(match[2]) };
  match = path.match(/^(.*)\/(\d+)\/index\.html$/i);
  if (match && match[1] && !/\/page$/.test(match[1])) {
    return { kind: "num-dir", prefix: match[1], number: Number(match[2]) };
  }
  match = path.match(/^(.*)\/(\d+)\.html$/i);
  if (match && match[1] && !/\/page$/.test(match[1])) {
    return { kind: "num-file", prefix: match[1], number: Number(match[2]) };
  }
  return null;
}

function landingPrefix(path: string): string | null {
  if (!path.endsWith("/index.html") || path.includes("?")) return null;
  const dir = path.slice(0, -"/index.html".length);
  if (/\/page\/\d+$/.test(dir) || /\/\d+$/.test(dir)) return null;
  return dir;
}

function indexArticles(pages: ListingSourcePage[]): {
  list: Article[];
  byUrl: Map<string, Article>;
} {
  const list: Article[] = [];
  const byUrl = new Map<string, Article>();
  for (const page of pages) {
    const facts = articleFacts(page.html);
    if (!facts) continue;
    const article: Article = { ...facts, path: page.path };
    list.push(article);
    for (const key of urlKeys(page.path)) byUrl.set(key, article);
  }
  return { list, byUrl };
}

function urlKeys(path: string): string[] {
  const pub = siteUrl(path.split("?")[0] ?? path);
  const keys = new Set<string>([pub]);
  if (pub.endsWith("/")) keys.add(pub.slice(0, -1));
  else keys.add(`${pub}/`);
  if (pub.endsWith(".html")) keys.add(pub.slice(0, -".html".length));
  if (pub.endsWith("/index.html")) keys.add(pub.slice(0, -"index.html".length));
  return [...keys];
}

function lookup(href: string, byUrl: Map<string, Article>): Article | undefined {
  const normalized = normalizeHref(href);
  if (!normalized) return undefined;
  const base = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  return (
    byUrl.get(base) ??
    byUrl.get(`${base}/`) ??
    byUrl.get(`${base}.html`) ??
    byUrl.get(`${base}/index.html`)
  );
}

function normalizeHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed || /^(#|mailto:|javascript:|tel:)/i.test(trimmed)) return "";
  try {
    const url = new URL(trimmed, "https://site.invalid");
    return url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function articleFacts(html: string): Facts | null {
  const ld = jsonLd(html);
  const meta = metaFacts(html);
  const date = ld?.date || meta.date;
  const time = date ? publishedTime(date) : null;
  if (!date || time === null) return null;
  const tags = ld && ld.tags.length > 0 ? ld.tags : meta.tags;
  return { time, section: ld?.section || meta.section, tags };
}

function jsonLd(html: string): { date: string; section: string; tags: string[] } | null {
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const type = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(script[1] ?? "");
    const value = (type?.[1] ?? type?.[2] ?? "").toLowerCase();
    if (value !== "application/ld+json") continue;
    const article = firstArticle(parseJson(script[2] ?? ""));
    if (!article) continue;
    return {
      date: textValue(article.datePublished),
      section: textValue(article.articleSection),
      tags: keywords(article.keywords)
    };
  }
  return null;
}

function parseJson(raw: string): unknown {
  const body = raw
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function firstArticle(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstArticle(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const names = (Array.isArray(type) ? type : [type]).filter(
    (item): item is string => typeof item === "string"
  );
  if (
    names.some((name) =>
      ARTICLE_TYPES.has(name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name)
    )
  ) {
    return record;
  }
  if ("@graph" in record) return firstArticle(record["@graph"]);
  return null;
}

function keywords(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof item === "string" ? keywords(item) : []));
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metaFacts(html: string): { date: string; section: string; tags: string[] } {
  const fields = { date: "", section: "", tags: [] as string[] };
  for (const tag of html.matchAll(/<meta\b([^>]*?)\/?>/gi)) {
    const attrs = readAttrs(tag[1] ?? "");
    const key = (attrValue(attrs, "property") || attrValue(attrs, "name")).toLowerCase();
    const content = attrValue(attrs, "content");
    if (!key || !content) continue;
    if (key === "article:published_time" && !fields.date) fields.date = content;
    else if (key === "article:section" && !fields.section) fields.section = content;
    else if (key === "article:tag") fields.tags.push(content);
  }
  return fields;
}

function publishedTime(value: string): number | null {
  const trimmed = value.trim();
  let parsed: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) parsed = Date.parse(`${trimmed}T00:00:00Z`);
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(trimmed))
    parsed = Date.parse(`${trimmed}Z`);
  else parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildTemplate(html: string, run: El[], pager: Pager): string {
  const first = run[0];
  const last = run[run.length - 1];
  if (!first || !last) return html;
  const item = `<!--#listing item -->${placeholderItem(html.slice(first.start, first.end))}<!--#listing /item -->`;
  const edits: Edit[] = [{ start: first.start, end: last.end, text: item }];
  if (pager.prev) wrapPager(edits, pager.prev, "prev", html);
  if (pager.next) wrapPager(edits, pager.next, "next", html);
  for (const drop of pager.drops) {
    if (overlaps(drop, first.start, last.end)) continue;
    edits.push({ start: drop.start, end: drop.end, text: "" });
  }
  return placeholderChrome(applyEdits(html, edits));
}

function overlaps(el: El, start: number, end: number): boolean {
  return el.start < end && el.end > start;
}

function wrapPager(edits: Edit[], el: El, name: "prev" | "next", html: string): void {
  const inner = html
    .slice(el.start, el.end)
    .replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/i, `href="{{${name}}}"`);
  edits.push({
    start: el.start,
    end: el.end,
    text: `<!--#listing ${name} -->${inner}<!--#listing /${name} -->`
  });
}

function placeholderItem(fragment: string): string {
  let out = fragment.replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi, 'href="{{url}}"');
  out = out.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi,
    '$1"{{image}}"'
  );
  out = out.replace(/>([^<]+)</g, (whole, text: string) => {
    if (!text.trim() || text.includes("{{")) return whole;
    return ">{{text}}<";
  });
  out = out.replace(
    /<(h[1-6])(\b[^>]*)>(\s*<a\b[^>]*>)\s*\{\{text\}\}\s*(<\/a>\s*)<\/\1>/gi,
    "<$1$2>$3{{heading}}$4</$1>"
  );
  out = out.replace(/<(h[1-6])(\b[^>]*)>\s*\{\{text\}\}\s*<\/\1>/gi, "<$1$2>{{heading}}</$1>");
  if (!/<h[1-6]\b/i.test(out)) {
    out = out.replace(/(<a\b[^>]*>)\s*\{\{text\}\}/i, "$1{{heading}}");
  }
  return out;
}

function placeholderChrome(html: string): string {
  let out = html.replace(/<title>[^<]*<\/title>/i, "<title>{{title}}</title>");
  out = out.replace(/<h1(\b[^>]*)>[\s\S]*?<\/h1>/i, "<h1$1>{{title}}</h1>");
  return out;
}

function ensurePager(html: string): string {
  if (html.includes("<!--#listing prev -->") || html.includes("<!--#listing next -->")) return html;
  const main = html.toLowerCase().lastIndexOf("</main>");
  if (main >= 0) return `${html.slice(0, main)}${FALLBACK_PAGER}\n${html.slice(main)}`;
  const body = html.toLowerCase().lastIndexOf("</body>");
  if (body >= 0) return `${html.slice(0, body)}${FALLBACK_PAGER}\n${html.slice(body)}`;
  return `${html}\n${FALLBACK_PAGER}\n`;
}

function h1Text(html: string): string {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const text = (match?.[1] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || "News";
}

function neutralize(html: string): string {
  return html.replace(/<!--#include\b[\s\S]*?-->/gi, (directive) => {
    if (!/\bactive\s*=/.test(directive)) return directive;
    return directive.replace(
      /\bactive\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/i,
      'active="{{path}}"'
    );
  });
}

function applyEdits(html: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = html;
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end > out.length || edit.start > edit.end) continue;
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

function siteUrl(path: string): string {
  const queryAt = path.indexOf("?");
  const file = queryAt >= 0 ? path.slice(0, queryAt) : path;
  const query = queryAt >= 0 ? path.slice(queryAt) : "";
  let base: string;
  if (file === "index.html" || file === "") base = "/";
  else if (file.endsWith("/index.html")) base = `/${file.slice(0, -"index.html".length)}`;
  else base = `/${file}`;
  return `${base}${query}`;
}

function sameUrl(a: string, b: string): boolean {
  const norm = (value: string) => {
    const [path, query] = value.split("?");
    const trimmed = (path ?? "").replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/";
    return query ? `${trimmed}?${query}` : trimmed;
  };
  return norm(a) === norm(b);
}

function dedupeRedirects(redirects: RedirectRule[]): RedirectRule[] {
  const seen = new Set<string>();
  const out: RedirectRule[] = [];
  for (const redirect of redirects) {
    if (seen.has(redirect.fromPath) || sameUrl(redirect.fromPath, redirect.toPath)) continue;
    seen.add(redirect.fromPath);
    out.push(redirect);
  }
  return out.sort((a, b) => a.fromPath.localeCompare(b.fromPath));
}

function uniqueArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const article of articles) {
    if (seen.has(article.path)) continue;
    seen.add(article.path);
    out.push(article);
  }
  return out;
}

function mode(values: number[]): number {
  if (values.length === 0) return 1;
  const freq = new Map<number, number>();
  for (const value of values) freq.set(value, (freq.get(value) ?? 0) + 1);
  let best = 0;
  for (const count of freq.values()) if (count > best) best = count;
  const tied = [...freq.entries()]
    .filter(([, count]) => count === best)
    .map(([value]) => value)
    .sort((a, b) => a - b);
  return tied[Math.floor((tied.length - 1) / 2)] ?? values[0] ?? 1;
}

function splitFull(counts: number[]): { full: number[] } {
  if (counts.length === 0) return { full: [] };
  const peak = mode(counts);
  const min = Math.min(...counts);
  const minCount = counts.filter((count) => count === min).length;
  if (min < peak && minCount === 1) return { full: counts.filter((count) => count !== min) };
  return { full: counts };
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

function inChrome(el: El, root: El): boolean {
  let current: El | undefined = el;
  while (current && current !== root) {
    if (CHROME.has(current.tag)) return true;
    current = parentOf(current, root);
  }
  return false;
}

function parentOf(el: El, root: El): El | undefined {
  let found: El | undefined;
  const visit = (node: El) => {
    if (found) return;
    for (const child of node.children) {
      if (child === el) {
        found = node;
        return;
      }
      visit(child);
    }
  };
  visit(root);
  return found;
}

function walk(el: El, visit: (el: El) => void): void {
  visit(el);
  for (const child of el.children) walk(child, visit);
}

function parseHtml(html: string): El {
  const root = make("#document", 0);
  const stack: El[] = [root];
  let index = 0;
  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt < 0) break;
    const tag = readTag(html, lt);
    if (!tag || tag.end <= lt) {
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
    const child = make(tag.name, lt);
    child.end = tag.end;
    child.className = attrValue(tag.attrs, "class");
    child.rel = attrValue(tag.attrs, "rel");
    const href = tag.attrs.find((item) => item.name === "href");
    if (href) {
      child.href = href.value;
      child.hrefStart = href.valueStart;
      child.hrefEnd = href.valueEnd;
    }
    stack[stack.length - 1]?.children.push(child);
    if (tag.selfClosing || VOID.has(tag.name)) {
      index = tag.end;
      continue;
    }
    stack.push(child);
    if (RAW.has(tag.name)) {
      const close = findClose(html, tag.end, tag.name);
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

function make(tag: string, start: number): El {
  return {
    tag,
    start,
    end: start,
    className: "",
    href: "",
    hrefStart: 0,
    hrefEnd: 0,
    rel: "",
    children: []
  };
}

function findClose(html: string, from: number, name: string): { end: number } | null {
  const last = html.length;
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
    if (html[cursor] === ">") return { end: cursor + 1 };
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
    if (char === ">")
      return {
        kind: closing ? "close" : "open",
        name,
        start,
        end: index + 1,
        attrs,
        selfClosing: false
      };
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

function readAttrs(raw: string): Attr[] {
  return readTag(`<x ${raw}>`, 0)?.attrs ?? [];
}

function attrValue(attrs: Attr[], name: string): string {
  return attrs.find((item) => item.name === name)?.value ?? "";
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
