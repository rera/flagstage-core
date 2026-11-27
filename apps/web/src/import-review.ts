import {
  fallbackBlockExplanation,
  isCustomerSentence,
  sectionFromBlockDetail
} from "@flagstage/ai";

/**
 * One adapter from an import row and the stored snapshot files to the
 * Overview screens. Progress counts are whatever the crawl has written.
 * A later hook can add `stage` without another reader.
 */

export type ImportProgressView = {
  /** Named stage, or "Copying pages" once counts exist. */
  stage: string | null;
  pagesFound: number | null;
  pagesDone: number | null;
  skipped: number;
};

export type ImportSection = {
  id: string;
  name: string;
  pages: number;
};

export type ImportPageType = {
  id: string;
  name: string;
  pages: number;
};

export type ImportFlag = {
  detail: string;
  pagePath: string;
  label: string;
  href: string;
};

export type ImportSummary = {
  pages: number;
  sections: ImportSection[];
  pageTypes: ImportPageType[];
  flags: ImportFlag[];
  /** One row per removed or leftover form: "Search box on /blog". */
  pluginNotes: string[];
};

export const PLUGIN_NOTE_HEADING = "Some features need a plugin";

export const PLUGIN_NOTE_BODY =
  "We took these off your new site for now. They'll come back once the matching plugin is ready.";

const PLUGIN_KIND_LABEL: Record<string, string> = {
  search: "Search box",
  login: "Sign-in form",
  comments: "Comment form",
  checkout: "Checkout",
  "file-upload": "File upload form"
};

const PLUGIN_LABEL_ORDER = [
  "Search box",
  "Sign-in form",
  "Comment form",
  "Checkout",
  "File upload form",
  "Form"
];

const DEFAULT_STAGE = "Copying pages";

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function detectedHint(label: string): string {
  return `${label} was detected from this address. Change this if that's wrong.`;
}

export function sameOn(count: number): string {
  const shown = formatCount(count);
  return count === 1 ? `same on ${shown} page` : `same on ${shown} pages`;
}

export function typePages(count: number): string {
  const shown = formatCount(count);
  return count === 1 ? `${shown} page` : `${shown} pages`;
}

export function skippedPages(count: number): string {
  const shown = formatCount(count);
  return count === 1
    ? `Skipped ${shown} page that could not be copied.`
    : `Skipped ${shown} pages that could not be copied.`;
}

export function readImportProgress(stats: unknown): ImportProgressView {
  const record = recordOf(stats);
  const pagesFound = readCount(record.pagesFound);
  const pagesDone = readCount(record.pagesDone);
  const skipped = readSkipped(record.skipped);
  const named = typeof record.stage === "string" ? record.stage.trim() : "";
  const hasCounts = pagesFound != null || pagesDone != null;
  return {
    stage: named || (hasCounts ? DEFAULT_STAGE : null),
    pagesFound,
    pagesDone,
    skipped
  };
}

export function readImportSummary(input: {
  stats: unknown;
  report: unknown;
  drift: string | null;
  skill: string | null;
  baseline: string | null;
  siteId: string;
  pagesHtml?: ReadonlyMap<string, string | null>;
}): ImportSummary {
  const sections = readSections(input.drift);
  const pageTypes = readPageTypes(input.skill);
  const flags = readFlags(input.report, input.siteId, input.pagesHtml ?? new Map());
  return {
    pages: readPageCount(input.baseline, input.stats),
    sections,
    pageTypes,
    flags,
    pluginNotes: pluginFeatureNotes(input.report)
  };
}

/**
 * Rows for the Overview note. Removed search, sign-in, comment, checkout,
 * and file-upload forms, plus a form that still points at the old site.
 * A leftover that is not one of those kinds is "Form on {page}".
 */
export function pluginFeatureNotes(report: unknown): string[] {
  const record = recordOf(report);
  const rows: string[] = [];
  if (Array.isArray(record.forms)) {
    for (const entry of record.forms) {
      const row = recordOf(entry);
      const label = pluginKindLabel(row.kind);
      const path = notePath(row.page);
      if (!label || !path) continue;
      rows.push(`${label} on ${path}`);
    }
  }
  if (Array.isArray(record.legacyForms)) {
    for (const entry of record.legacyForms) {
      const row = recordOf(entry);
      const path = notePath(row.page);
      if (!path) continue;
      const label = pluginKindLabel(row.kind) ?? leftoverLabel(row.detail) ?? "Form";
      rows.push(`${label} on ${path}`);
    }
  }
  return [...new Set(rows)].sort(comparePluginNotes);
}

export function flagPagePaths(report: unknown): string[] {
  return [...new Set(readFlagGroups(report).map((flag) => flag.pagePath))];
}

function readPageCount(baseline: string | null, stats: unknown): number {
  if (baseline) {
    try {
      const parsed = JSON.parse(baseline) as { pages?: unknown };
      if (Array.isArray(parsed.pages)) return parsed.pages.length;
    } catch {
      // Fall through to the crawl totals.
    }
  }
  const record = recordOf(stats);
  return readCount(record.pages) ?? readCount(record.pagesFound) ?? 0;
}

function readSections(drift: string | null): ImportSection[] {
  if (!drift) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(drift);
  } catch {
    return [];
  }
  const includes = recordOf(parsed).includes;
  if (!Array.isArray(includes)) return [];
  const sections: ImportSection[] = [];
  for (const entry of includes) {
    const row = recordOf(entry);
    if (typeof row.virtual !== "string" || !row.virtual) continue;
    const pages = new Set<string>();
    if (Array.isArray(row.placements)) {
      for (const placement of row.placements) {
        const page = recordOf(placement).page;
        if (typeof page === "string" && page) pages.add(page);
      }
    }
    sections.push({
      id: row.virtual,
      name: sectionName(row.virtual),
      pages: pages.size
    });
  }
  return sections.sort(
    (left, right) =>
      sectionRank(left.name) - sectionRank(right.name) || left.name.localeCompare(right.name)
  );
}

function readPageTypes(skill: string | null): ImportPageType[] {
  if (!skill) return [];
  const found: ImportPageType[] = [];
  const pattern = /^- `([^`]+)` — template `_templates\/[^`]+\.html`\. (\d+) pages/gm;
  for (const match of skill.matchAll(pattern)) {
    const id = match[1] ?? "";
    const pages = Number(match[2]);
    if (!id || !Number.isFinite(pages)) continue;
    found.push({ id, name: typeName(id), pages });
  }
  return found;
}

function readFlags(
  report: unknown,
  siteId: string,
  pagesHtml: ReadonlyMap<string, string | null>
): ImportFlag[] {
  return readFlagGroups(report).map((flag) => ({
    detail: flag.detail,
    pagePath: flag.pagePath,
    label: pageLabel(flag.pagePath, pagesHtml.get(flag.pagePath) ?? null),
    href: pageHref(siteId, flag.pagePath)
  }));
}

function readFlagGroups(report: unknown): Array<{ detail: string; pagePath: string }> {
  const uncertain = recordOf(report).uncertain;
  if (!Array.isArray(uncertain)) return [];
  const groups = new Map<string, string[]>();
  for (const entry of uncertain) {
    const row = recordOf(entry);
    if (typeof row.page !== "string" || !row.page) continue;
    const detail = customerDetail(row);
    if (!detail) continue;
    const list = groups.get(detail);
    if (list) list.push(row.page);
    else groups.set(detail, [row.page]);
  }
  return [...groups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([detail, pages]) => ({
      detail,
      pagePath: [...pages].sort((left, right) => left.localeCompare(right))[0] ?? ""
    }))
    .filter((flag) => flag.pagePath);
}

/** The sentence a site owner reads. A shared-block debug note never reaches the page. */
function customerDetail(row: Record<string, unknown>): string {
  const explanation = typeof row.explanation === "string" ? row.explanation.trim() : "";
  if (isCustomerSentence(explanation)) return explanation;
  const detail = typeof row.detail === "string" ? row.detail : "";
  const section = sectionFromBlockDetail(detail);
  if (section) return fallbackBlockExplanation(section);
  return detail;
}

function sectionName(virtual: string): string {
  const base =
    virtual
      .split("/")
      .pop()
      ?.replace(/\.html?$/i, "") ?? virtual;
  const key = base.toLowerCase();
  if (key === "header" || key.startsWith("header-")) return "Header";
  if (key === "footer" || key.startsWith("footer-")) return "Footer";
  if (key === "nav" || key.startsWith("nav-")) return "Navigation";
  const words = key.split("-").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function sectionRank(name: string): number {
  if (name === "Header") return 0;
  if (name === "Navigation") return 1;
  if (name === "Footer") return 2;
  return 3;
}

function typeName(kind: string): string {
  if (kind === "article") return "Article";
  if (kind === "listing") return "Listing";
  if (kind === "page") return "Page";
  const words = kind
    .split(/[\s-]+/)
    .filter(Boolean)
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function pageHref(siteId: string, storagePath: string): string {
  const path = publicPath(storagePath);
  return path === "/" ? `/sites/${siteId}/live` : `/sites/${siteId}/live${path}`;
}

function pluginKindLabel(kind: unknown): string | null {
  if (typeof kind !== "string") return null;
  return PLUGIN_KIND_LABEL[kind] ?? null;
}

function leftoverLabel(detail: unknown): string | null {
  if (typeof detail !== "string") return null;
  const action = detail.match(/"([^"]*)"/)?.[1]?.trim() ?? "";
  if (!action) return null;
  if (/(?:^|[/?&#=._-])search(?:[/?&#=._-]|$)/i.test(action)) return "Search box";
  if (/(?:^|[/?&#=._-])(?:wp-login(?:\.php)?|log-?in|sign-?in)(?:[/?&#=._-]|$)/i.test(action)) {
    return "Sign-in form";
  }
  if (
    /(?:^|[/?&#=._-])(?:wp-comments-post|comment-?form|comments?)(?:[/?&#=._-]|$)/i.test(action)
  ) {
    return "Comment form";
  }
  if (/(?:^|[/?&#=._-])(?:add-to-cart|checkout|cart|payment)(?:[/?&#=._-]|$)/i.test(action)) {
    return "Checkout";
  }
  if (/(?:^|[/?&#=._-])(?:file-upload|upload)(?:[/?&#=._-]|$)/i.test(action)) {
    return "File upload form";
  }
  return null;
}

function comparePluginNotes(left: string, right: string): number {
  const a = splitPluginNote(left);
  const b = splitPluginNote(right);
  const kind = PLUGIN_LABEL_ORDER.indexOf(a.label) - PLUGIN_LABEL_ORDER.indexOf(b.label);
  if (kind !== 0) return kind;
  return a.path.localeCompare(b.path);
}

function splitPluginNote(row: string): { label: string; path: string } {
  const at = row.lastIndexOf(" on ");
  if (at < 0) return { label: row, path: "" };
  return { label: row.slice(0, at), path: row.slice(at + " on ".length) };
}

function notePath(value: unknown): string {
  if (typeof value !== "string") return "";
  const page = value.trim().split("?")[0] ?? "";
  if (!page) return "";
  const path = publicPath(page);
  if (path.length > 1 && path.endsWith("/")) return path.replace(/\/+$/, "");
  return path;
}

function publicPath(storagePath: string): string {
  if (storagePath === "index.html") return "/";
  if (storagePath.endsWith("/index.html")) {
    return `/${storagePath.slice(0, -"/index.html".length)}`;
  }
  return `/${storagePath.replace(/^\/+/, "")}`;
}

function pageLabel(storagePath: string, html: string | null): string {
  const titled = html ? readTitle(html) : "";
  if (titled) return titled;
  const path = publicPath(storagePath);
  if (path === "/") return "Home";
  const segment = path.split("/").filter(Boolean).pop() ?? path;
  const words = segment.replace(/\.html?$/i, "").replace(/[-_]+/g, " ");
  return words.replace(/\b[a-zA-Z]/g, (letter) => letter.toUpperCase());
}

function readTitle(html: string): string {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  if (title) return decodeEntities(title);
  const heading = html.match(/<h1[^>]*>([^<]*)<\/h1>/i)?.[1]?.trim();
  return heading ? decodeEntities(heading) : "";
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readSkipped(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (!Array.isArray(value)) return 0;
  return value.length;
}

function readCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function recordOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
