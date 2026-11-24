import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

import {
  SelectorError,
  htmlHasText,
  htmlMatchesJsonLd,
  htmlMatchesSelector,
  hrefMatchesPattern,
  linksIn,
  pathMatchesGlob,
  replaceInHtml,
  retagJsonLd,
  retagMarkup,
  rewriteLinks,
  safeHref,
  setJsonLdField,
  type ReplaceOptions
} from "./html";
import { isPageFile, type ToolCallRecord } from "./guard";

export type { ToolCallRecord };

const LOG_PATH = ".flagstage/edits/tool-log.jsonl";

type Scope = "pages" | "includes" | "all";

type Flags = {
  wholeWord: boolean;
  caseSensitive: boolean;
  preserveCase: boolean;
  skipQuotes: boolean;
  skipAttributes: boolean;
};

type Query = Flags & {
  glob?: string;
  text?: string;
  selector?: string;
  jsonLdField?: string;
  jsonLdValue?: string;
};

type FileText = { path: string; html: string };

type Outcome = {
  body: unknown;
  mode: ToolCallRecord["mode"];
  files: string[];
  dryRunId?: string;
  error?: string;
};

const boolFlag = (description: string) => ({ type: "boolean" as const, description });

const matchFlags = {
  wholeWord: boolFlag("Match whole words only. Default true, so marina does not match marinara."),
  caseSensitive: boolFlag("Match case. Default true."),
  skipQuotes: boolFlag("Skip blockquotes, q elements, and quoted spans. Default false."),
  skipAttributes: boolFlag("Skip text inside tag attributes. Default true.")
};

const queryFields = {
  glob: { type: "string", description: "Path glob, such as news/**/*.html." },
  text: { type: "string", description: "Only files whose text matches. Uses the match flags." },
  selector: {
    type: "string",
    description: "CSS selector: tag, .class, #id, [attr=value], descendant, or child."
  },
  jsonLdField: {
    type: "string",
    description: "JSON-LD field on the article, such as articleSection or keywords."
  },
  jsonLdValue: {
    type: "string",
    description: "Field equals this. Omit to match any page that has the field."
  },
  ...matchFlags
};

const applyField = {
  apply: {
    type: "string",
    description:
      "Dry-run id from a preview of these same arguments. Omit to preview and change nothing."
  }
};

const scopeField = {
  scope: {
    type: "string",
    enum: ["pages", "includes", "all"],
    description: "pages, includes, or all. Default all, which includes _inc and _templates."
  }
};

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "object",
    properties,
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {})
  };
}

export function siteEditToolSpecs(): { name: string; description: string; input: object }[] {
  return [
    {
      name: "find_pages",
      description: "Find page files by path glob, text, CSS selector, or a JSON-LD field.",
      input: schema(queryFields)
    },
    {
      name: "read_page",
      description: "Read one file from the site.",
      input: schema(
        {
          path: { type: "string", description: "Path relative to the site root." },
          maxChars: { type: "integer", description: "Maximum characters to return. Default 20000." }
        },
        ["path"]
      )
    },
    {
      name: "edit_include",
      description:
        "Replace text in one file under _inc/. Prefer this when the same block is on many pages.",
      input: schema(
        {
          path: { type: "string", description: "Include path, such as _inc/footer.html." },
          find: { type: "string", description: "Text to replace." },
          replace: { type: "string", description: "Replacement text. May be empty." },
          preserveCase: boolFlag(
            "With a case-insensitive match, copy the match's capitalization onto the replacement. Default false."
          ),
          ...matchFlags,
          ...applyField
        },
        ["path", "find", "replace"]
      )
    },
    {
      name: "set_meta",
      description: "Set or remove one JSON-LD field on the matching pages.",
      input: schema({
        ...queryFields,
        field: { type: "string", description: "JSON-LD key, such as articleSection." },
        value: {
          description:
            "New value: a string, number, boolean, or array of strings. Omit when removing."
        },
        remove: boolFlag("Remove the field. Default false."),
        ...applyField
      })
    },
    {
      name: "retag",
      description:
        "Add or remove a tag in JSON-LD keywords, article:tag meta, and visible rel=tag links.",
      input: schema({
        ...queryFields,
        add: { type: "string", description: "Tag to add." },
        remove: { type: "string", description: "Tag to remove." },
        ...applyField
      })
    },
    {
      name: "replace_text",
      description: "Replace text in pages and includes. Skips script, style, and comments.",
      input: schema(
        {
          ...queryFields,
          ...scopeField,
          find: { type: "string", description: "Text to replace." },
          replace: { type: "string", description: "Replacement text. May be empty." },
          preserveCase: boolFlag(
            "With a case-insensitive match, copy the match's capitalization onto the replacement. Default false."
          ),
          ...applyField
        },
        ["find", "replace"]
      )
    },
    {
      name: "list_links",
      description: "Find hrefs by pattern, or rewrite them.",
      input: schema(
        {
          pattern: {
            type: "string",
            description:
              "Href pattern. Without * it matches hrefs that contain it. * is one segment, ** crosses slashes. * and ** become $1, $2 in the replacement."
          },
          replacement: {
            type: "string",
            description: "New href. Omit to list matches and change nothing."
          },
          glob: queryFields.glob,
          ...scopeField,
          ...applyField
        },
        ["pattern"]
      )
    }
  ];
}

export function runSiteTool(
  root: string,
  name: string,
  input: unknown
): { body: unknown; record: ToolCallRecord } {
  const outcome = execute(root, name, input);
  const record: ToolCallRecord = {
    tool: name,
    mode: outcome.mode,
    files: outcome.files,
    at: new Date().toISOString()
  };
  if (outcome.dryRunId) record.dryRunId = outcome.dryRunId;
  if (outcome.error) record.error = outcome.error;
  appendToolLog(root, record);
  return { body: outcome.body, record };
}

export function readToolLog(root: string): ToolCallRecord[] {
  const file = join(root, ...LOG_PATH.split("/"));
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ToolCallRecord);
}

function appendToolLog(root: string, record: ToolCallRecord): void {
  const file = join(root, ...LOG_PATH.split("/"));
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`);
}

function execute(root: string, name: string, input: unknown): Outcome {
  try {
    if (!siteEditToolSpecs().some((tool) => tool.name === name)) {
      return fail("Unknown tool.");
    }
    if (name === "find_pages") return findPages(root, input);
    if (name === "read_page") return readPage(root, input);
    if (name === "edit_include") return editInclude(root, input);
    if (name === "set_meta") return setMeta(root, input);
    if (name === "retag") return retag(root, input);
    if (name === "replace_text") return replaceText(root, input);
    return listLinks(root, input);
  } catch (error) {
    if (error instanceof SelectorError) return fail(error.message);
    throw error;
  }
}

function fail(error: string): Outcome {
  return { body: { error }, mode: "read", files: [], error };
}

function findPages(root: string, input: unknown): Outcome {
  const parsed = readQuery(input, [...Object.keys(queryFields)]);
  if ("error" in parsed) return fail(parsed.error);
  const selected = filterFiles(listHtml(root, "pages"), parsed.query);
  const pages = selected.map((file) => file.path);
  return {
    body: { count: pages.length, pages: pages.slice(0, 40), truncated: pages.length > 40 },
    mode: "read",
    files: pages
  };
}

function readPage(root: string, input: unknown): Outcome {
  const picked = pick(input, ["path", "maxChars"]);
  if ("error" in picked) return fail(picked.error);
  const path = requiredString(picked.values, "path");
  if (typeof path !== "string") return fail(path.error);
  const maxChars = picked.values.maxChars === undefined ? 20_000 : picked.values.maxChars;
  if (typeof maxChars !== "number" || !Number.isInteger(maxChars) || maxChars < 1) {
    return fail("maxChars must be a positive integer.");
  }
  const rel = relativeInside(root, path);
  if (!rel) return fail("path must stay inside the site.");
  const text = readSiteText(root, rel);
  if (text === null) return fail(`No such file ${rel}.`);
  return {
    body: { path: rel, text: text.slice(0, maxChars), truncated: text.length > maxChars },
    mode: "read",
    files: [rel]
  };
}

function editInclude(root: string, input: unknown): Outcome {
  const allowed = ["path", "find", "replace", "preserveCase", ...Object.keys(matchFlags), "apply"];
  const picked = pick(input, allowed);
  if ("error" in picked) return fail(picked.error);
  const path = requiredString(picked.values, "path");
  const find = requiredString(picked.values, "find");
  const replace = requiredString(picked.values, "replace", true);
  if (typeof path !== "string") return fail(path.error);
  if (typeof find !== "string") return fail(find.error);
  if (typeof replace !== "string") return fail(replace.error);
  const flags = readFlags(picked.values);
  if ("error" in flags) return fail(flags.error);
  const rel = relativeInside(root, path);
  if (!rel || !rel.startsWith("_inc/") || rel.endsWith("/")) {
    return fail("path must be a file under _inc/.");
  }
  const before = readSiteText(root, rel);
  if (before === null) return fail(`No such file ${rel}.`);
  const after = replaceInHtml(before, { find, replace, ...flags.flags });
  const args = { path: rel, find, replace, ...flags.flags };
  return mutate(
    root,
    "edit_include",
    args,
    [{ path: rel, before, after }],
    0,
    applyId(picked.values)
  );
}

function setMeta(root: string, input: unknown): Outcome {
  const allowed = [...Object.keys(queryFields), "field", "value", "remove", "apply"];
  const picked = pick(input, allowed);
  if ("error" in picked) return fail(picked.error);
  const parsed = readQuery(picked.values, allowed);
  if ("error" in parsed) return fail(parsed.error);
  const field = requiredString(picked.values, "field");
  if (typeof field !== "string") return fail(field.error);
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(field) || field === "constructor" || field === "prototype") {
    return fail("field must be a JSON-LD name such as articleSection.");
  }
  const remove = picked.values.remove === true;
  if (picked.values.remove !== undefined && typeof picked.values.remove !== "boolean") {
    return fail("remove must be a boolean.");
  }
  let value: unknown;
  if (!remove) {
    const read = readMetaValue(picked.values.value);
    if ("error" in read) return fail(read.error);
    value = read.value;
  }
  const selected = filterFiles(listHtml(root, "pages"), parsed.query);
  const planned = selected.map((file) => ({
    path: file.path,
    before: file.html,
    after: setJsonLdField(file.html, field, value, remove)
  }));
  const args = { ...queryArgs(parsed.query), field, remove, ...(remove ? {} : { value }) };
  return mutate(root, "set_meta", args, planned, pageCount(selected), applyId(picked.values));
}

function retag(root: string, input: unknown): Outcome {
  const allowed = [...Object.keys(queryFields), "add", "remove", "apply"];
  const picked = pick(input, allowed);
  if ("error" in picked) return fail(picked.error);
  const parsed = readQuery(picked.values, allowed);
  if ("error" in parsed) return fail(parsed.error);
  const add = optionalString(picked.values, "add");
  const remove = optionalString(picked.values, "remove");
  if (typeof add !== "string" && add !== undefined) return fail(add.error);
  if (typeof remove !== "string" && remove !== undefined) return fail(remove.error);
  if (!add && !remove) return fail("Pass add, remove, or both.");
  if (add && remove && add.trim().toLowerCase() === remove.trim().toLowerCase()) {
    return fail("add and remove must be different tags.");
  }
  const selected = filterFiles(listHtml(root, "pages"), parsed.query);
  const planned = selected.map((file) => ({
    path: file.path,
    before: file.html,
    after: retagMarkup(retagJsonLd(file.html, add, remove), add, remove)
  }));
  const args = {
    ...queryArgs(parsed.query),
    ...(add ? { add } : {}),
    ...(remove ? { remove } : {})
  };
  return mutate(root, "retag", args, planned, pageCount(selected), applyId(picked.values));
}

function replaceText(root: string, input: unknown): Outcome {
  const allowed = [
    ...Object.keys(queryFields),
    "scope",
    "find",
    "replace",
    "preserveCase",
    "apply"
  ];
  const picked = pick(input, allowed);
  if ("error" in picked) return fail(picked.error);
  const parsed = readQuery(picked.values, allowed);
  if ("error" in parsed) return fail(parsed.error);
  const find = requiredString(picked.values, "find");
  const replace = requiredString(picked.values, "replace", true);
  if (typeof find !== "string") return fail(find.error);
  if (typeof replace !== "string") return fail(replace.error);
  const scope = readScope(picked.values, "all");
  if (typeof scope !== "string") return fail(scope.error);
  const selected = filterFiles(listHtml(root, scope), parsed.query);
  const options: ReplaceOptions = { find, replace, ...parsed.query };
  const planned = selected.map((file) => ({
    path: file.path,
    before: file.html,
    after: replaceInHtml(file.html, options)
  }));
  const args = { ...queryArgs(parsed.query), scope, find, replace };
  return mutate(root, "replace_text", args, planned, pageCount(selected), applyId(picked.values));
}

function listLinks(root: string, input: unknown): Outcome {
  const picked = pick(input, ["pattern", "replacement", "glob", "scope", "apply"]);
  if ("error" in picked) return fail(picked.error);
  const pattern = requiredString(picked.values, "pattern");
  if (typeof pattern !== "string") return fail(pattern.error);
  const replacement = optionalString(picked.values, "replacement", true);
  if (typeof replacement !== "string" && replacement !== undefined) return fail(replacement.error);
  const glob = optionalString(picked.values, "glob");
  if (typeof glob !== "string" && glob !== undefined) return fail(glob.error);
  const scope = readScope(picked.values, "all");
  if (typeof scope !== "string") return fail(scope.error);
  const files = listHtml(root, scope).filter((file) => !glob || pathMatchesGlob(file.path, glob));
  if (replacement === undefined) {
    const links: { path: string; href: string; text: string }[] = [];
    for (const file of files) {
      for (const link of linksIn(file.html)) {
        if (!hrefMatchesPattern(link.href, pattern)) continue;
        links.push({ path: file.path, href: link.href, text: link.text });
      }
    }
    return {
      body: { count: links.length, links: links.slice(0, 40), truncated: links.length > 40 },
      mode: "read",
      files: [...new Set(links.map((link) => link.path))]
    };
  }
  const planned: { path: string; before: string; after: string }[] = [];
  for (const file of files) {
    const rewritten = rewriteLinks(file.html, pattern, replacement);
    if (rewritten.changes.some((change) => !safeHref(change.next))) {
      return fail("replacement produced an href that would break the tag.");
    }
    planned.push({ path: file.path, before: file.html, after: rewritten.html });
  }
  const sampleChanges = planned
    .filter((file) => file.before !== file.after)
    .slice(0, 3)
    .flatMap((file) =>
      rewriteLinks(file.before, pattern, replacement)
        .changes.slice(0, 3)
        .map((change) => ({
          path: file.path,
          diff: `-${change.href}\n+${change.next}`
        }))
    );
  const args = { pattern, replacement, ...(glob ? { glob } : {}), scope };
  const result = mutate(
    root,
    "list_links",
    args,
    planned,
    pageCount(files),
    applyId(picked.values)
  );
  if (
    result.body &&
    typeof result.body === "object" &&
    "sample" in result.body &&
    result.mode === "dry-run"
  ) {
    return { ...result, body: { ...result.body, sample: sampleChanges } };
  }
  return result;
}

function mutate(
  root: string,
  tool: string,
  args: unknown,
  planned: { path: string; before: string; after: string }[],
  pagesMatched: number,
  apply: string | undefined | { error: string }
): Outcome {
  if (apply && typeof apply !== "string") return fail(apply.error);
  const changed = planned.filter((file) => file.before !== file.after);
  const dryRunId = changed.length > 0 ? planId(tool, args, changed) : undefined;
  if (!apply) {
    return {
      body: {
        dryRun: true,
        ...(dryRunId ? { dryRunId } : {}),
        pagesMatched,
        matched: planned.length,
        changed: changed.length,
        sample: changed.slice(0, 3).map((file) => ({
          path: file.path,
          diff: unifiedDiff(file.path, file.before, file.after)
        }))
      },
      mode: "dry-run",
      files: changed.map((file) => file.path),
      dryRunId
    };
  }
  if (!dryRunId || apply !== dryRunId) {
    const error = dryRunId
      ? "That apply id does not match this preview. Call the tool again without apply."
      : "Nothing would change.";
    return {
      body: { error, ...(dryRunId ? { dryRunId } : {}) },
      mode: "dry-run",
      files: [],
      ...(dryRunId ? { dryRunId } : {}),
      error
    };
  }
  for (const file of changed) writeSiteText(root, file.path, file.after);
  const files = changed.map((file) => file.path);
  return {
    body: { applied: true, dryRunId, changed: files.length, files },
    mode: "apply",
    files,
    dryRunId
  };
}

function pageCount(files: FileText[]): number {
  return files.filter((file) => isPageFile(file.path)).length;
}

function filterFiles(files: FileText[], query: Query): FileText[] {
  return files.filter((file) => {
    if (query.glob && !pathMatchesGlob(file.path, query.glob)) return false;
    if (query.selector && !htmlMatchesSelector(file.html, query.selector)) return false;
    if (query.jsonLdField && !htmlMatchesJsonLd(file.html, query.jsonLdField, query.jsonLdValue)) {
      return false;
    }
    if (query.text && !htmlHasText(file.html, query.text, query)) return false;
    return true;
  });
}

function queryArgs(query: Query): Record<string, unknown> {
  return {
    wholeWord: query.wholeWord,
    caseSensitive: query.caseSensitive,
    preserveCase: query.preserveCase,
    skipQuotes: query.skipQuotes,
    skipAttributes: query.skipAttributes,
    ...(query.glob ? { glob: query.glob } : {}),
    ...(query.text ? { text: query.text } : {}),
    ...(query.selector ? { selector: query.selector } : {}),
    ...(query.jsonLdField ? { jsonLdField: query.jsonLdField } : {}),
    ...(query.jsonLdValue !== undefined ? { jsonLdValue: query.jsonLdValue } : {})
  };
}

function planId(tool: string, args: unknown, files: { path: string; before: string }[]): string {
  const hash = createHash("sha256");
  hash.update(tool);
  hash.update("\0");
  hash.update(canonical(args));
  const ordered = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
  for (const file of ordered) {
    hash.update("\0");
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.before);
  }
  return hash.digest("hex").slice(0, 16);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((left, right) =>
      left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function unifiedDiff(path: string, before: string, after: string): string {
  const left = before.split("\n");
  const right = after.split("\n");
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let endLeft = left.length - 1;
  let endRight = right.length - 1;
  while (endLeft >= start && endRight >= start && left[endLeft] === right[endRight]) {
    endLeft -= 1;
    endRight -= 1;
  }
  const lines = [`--- ${path}`, `+++ ${path}`];
  const from = Math.max(0, start - 1);
  for (let i = from; i < start; i += 1) lines.push(` ${clip(left[i] ?? "")}`);
  for (let i = start; i <= endLeft; i += 1) lines.push(`-${clip(left[i] ?? "")}`);
  for (let i = start; i <= endRight; i += 1) lines.push(`+${clip(right[i] ?? "")}`);
  if (lines.length > 24) return `${lines.slice(0, 24).join("\n")}\n…`;
  return lines.join("\n");
}

function clip(line: string): string {
  return line.length > 180 ? `${line.slice(0, 180)}…` : line;
}

function listHtml(root: string, scope: Scope): FileText[] {
  const paths: string[] = [];
  walk(root, root, paths);
  return paths
    .filter((path) => inScope(path, scope))
    .sort()
    .map((path) => ({ path, html: readFileSync(join(root, ...path.split("/")), "utf8") }));
}

function inScope(path: string, scope: Scope): boolean {
  const include = path === "_inc" || path.startsWith("_inc/");
  const template = path === "_templates" || path.startsWith("_templates/");
  if (scope === "includes") return include;
  if (scope === "pages") return !include && !template;
  return true;
}

function walk(dir: string, root: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === ".flagstage" || name === ".opencode" || name === "node_modules") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walk(abs, root, out);
      continue;
    }
    const rel = relative(root, abs).replaceAll("\\", "/");
    if (rel.endsWith(".html") || rel.endsWith(".htm")) out.push(rel);
  }
}

function readSiteText(root: string, rel: string): string | null {
  const abs = join(root, ...rel.split("/"));
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return readFileSync(abs, "utf8");
}

function writeSiteText(root: string, rel: string, text: string): void {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

function relativeInside(root: string, rel: string): string | null {
  const cleaned = rel.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return null;
  }
  const abs = join(root, ...cleaned.split("/"));
  const back = relative(root, abs);
  if (back.startsWith("..") || isAbsolute(back)) return null;
  return cleaned;
}

function pick(
  input: unknown,
  allowed: string[]
): { values: Record<string, unknown> } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Arguments must be an object." };
  }
  const values = input as Record<string, unknown>;
  const extra = Object.keys(values).find((key) => !allowed.includes(key));
  if (extra) return { error: `Unknown argument ${extra}.` };
  return { values };
}

function readQuery(input: unknown, allowed: string[]): { query: Query } | { error: string } {
  const picked = pick(input, allowed);
  if ("error" in picked) return picked;
  const flags = readFlags(picked.values);
  if ("error" in flags) return flags;
  const glob = optionalString(picked.values, "glob");
  const text = optionalString(picked.values, "text");
  const selector = optionalString(picked.values, "selector");
  const jsonLdField = optionalString(picked.values, "jsonLdField");
  const jsonLdValue = optionalString(picked.values, "jsonLdValue");
  for (const item of [glob, text, selector, jsonLdField, jsonLdValue]) {
    if (item && typeof item !== "string") return item;
  }
  if (typeof jsonLdValue === "string" && typeof jsonLdField !== "string") {
    return { error: "jsonLdValue needs jsonLdField." };
  }
  return {
    query: {
      ...flags.flags,
      ...(typeof glob === "string" ? { glob } : {}),
      ...(typeof text === "string" ? { text } : {}),
      ...(typeof selector === "string" ? { selector } : {}),
      ...(typeof jsonLdField === "string" ? { jsonLdField } : {}),
      ...(typeof jsonLdValue === "string" ? { jsonLdValue } : {})
    }
  };
}

function readFlags(values: Record<string, unknown>): { flags: Flags } | { error: string } {
  const wholeWord = readBool(values, "wholeWord", true);
  const caseSensitive = readBool(values, "caseSensitive", true);
  const preserveCase = readBool(values, "preserveCase", false);
  const skipQuotes = readBool(values, "skipQuotes", false);
  const skipAttributes = readBool(values, "skipAttributes", true);
  for (const item of [wholeWord, caseSensitive, preserveCase, skipQuotes, skipAttributes]) {
    if (typeof item === "string") return { error: item };
  }
  return {
    flags: {
      wholeWord: wholeWord as boolean,
      caseSensitive: caseSensitive as boolean,
      preserveCase: preserveCase as boolean,
      skipQuotes: skipQuotes as boolean,
      skipAttributes: skipAttributes as boolean
    }
  };
}

function readBool(
  values: Record<string, unknown>,
  key: string,
  fallback: boolean
): boolean | string {
  const value = values[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return `${key} must be a boolean.`;
}

function readScope(values: Record<string, unknown>, fallback: Scope): Scope | { error: string } {
  const value = values.scope;
  if (value === undefined) return fallback;
  if (value === "pages" || value === "includes" || value === "all") return value;
  return { error: "scope must be pages, includes, or all." };
}

function requiredString(
  values: Record<string, unknown>,
  key: string,
  allowEmpty = false
): string | { error: string } {
  const value = values[key];
  if (typeof value !== "string" || (!allowEmpty && value === ""))
    return { error: `${key} must be a string.` };
  return value;
}

function optionalString(
  values: Record<string, unknown>,
  key: string,
  allowEmpty = false
): string | undefined | { error: string } {
  if (values[key] === undefined) return undefined;
  return requiredString(values, key, allowEmpty);
}

function applyId(values: Record<string, unknown>): string | undefined | { error: string } {
  const value = values.apply;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "") return { error: "apply must be the dry-run id." };
  return value;
}

function readMetaValue(value: unknown): { value: unknown } | { error: string } {
  if (typeof value === "string" || typeof value === "boolean") return { value };
  if (typeof value === "number" && Number.isFinite(value)) return { value };
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return { value };
  return { error: "value must be a string, number, boolean, or array of strings." };
}
