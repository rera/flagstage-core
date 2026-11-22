import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";

import { SiteBuildError } from "./errors";

const MARK = "<!--#include";
const INCLUDE_ROOT = "/_inc/";

interface Directive {
  virtual: string;
  /** Present when the attribute was written, including an empty value. */
  active?: string;
}

/**
 * Resolves `<!--#include virtual="/_inc/...">` directives in one build.
 * Include text is cached per virtual path. The `active` splice is applied
 * per directive, after nested includes, and is not cached.
 */
export function createStitcher(sourceDir: string): {
  stitch(text: string, page: string): string;
} {
  const rawCache = new Map<string, string>();
  const resolvedCache = new Map<string, string>();
  const includeRoot = join(sourceDir, "_inc");

  function referencedFrom(page: string, stack: string[]): string {
    if (stack.length === 0) return page;
    return `${page} via ${stack.join(" -> ")}`;
  }

  function stitch(text: string, page: string): string {
    return resolveText(text, page, []);
  }

  function resolveText(text: string, page: string, stack: string[]): string {
    const parts: string[] = [];
    let cursor = 0;
    while (cursor < text.length) {
      const start = text.indexOf(MARK, cursor);
      if (start < 0) {
        parts.push(text.slice(cursor));
        break;
      }
      parts.push(text.slice(cursor, start));
      const end = text.indexOf("-->", start + MARK.length);
      if (end < 0) {
        throw new SiteBuildError(
          "bad-include",
          `Unclosed include in ${referencedFrom(page, stack)}`
        );
      }
      const raw = text.slice(start + MARK.length, end);
      const directive = parseDirective(raw, referencedFrom(page, stack));
      parts.push(expand(directive, page, stack));
      cursor = end + "-->".length;
    }
    const resolved = parts.join("");
    if (resolved.includes(MARK)) {
      throw new SiteBuildError(
        "bad-include",
        `Unresolved include left in ${referencedFrom(page, stack)}`
      );
    }
    return resolved;
  }

  function expand(directive: Directive, page: string, stack: string[]): string {
    const body = resolveVirtual(directive.virtual, page, stack);
    if (!directive.active) return body;
    return applyActive(body, directive.active);
  }

  function resolveVirtual(virtual: string, page: string, stack: string[]): string {
    const normalized = normalizeVirtual(virtual, referencedFrom(page, stack));
    if (stack.includes(normalized)) {
      throw new SiteBuildError(
        "include-cycle",
        `Include cycle: ${page} -> ${[...stack, normalized].join(" -> ")}`
      );
    }
    const cached = resolvedCache.get(normalized);
    if (cached !== undefined) return cached;
    const raw = readInclude(normalized, referencedFrom(page, stack));
    stack.push(normalized);
    try {
      const resolved = resolveText(raw, page, stack);
      resolvedCache.set(normalized, resolved);
      return resolved;
    } finally {
      stack.pop();
    }
  }

  function readInclude(virtual: string, where: string): string {
    const cached = rawCache.get(virtual);
    if (cached !== undefined) return cached;
    const abs = includePath(virtual);
    let info;
    try {
      info = statSync(abs);
    } catch {
      throw new SiteBuildError("missing-include", `Missing include "${virtual}" (from ${where})`);
    }
    if (!info.isFile()) {
      throw new SiteBuildError(
        "missing-include",
        `Include "${virtual}" is not a file (from ${where})`
      );
    }
    let real = abs;
    let root = includeRoot;
    try {
      real = realpathSync(abs);
      root = realpathSync(includeRoot);
    } catch {
      throw new SiteBuildError("missing-include", `Missing include "${virtual}" (from ${where})`);
    }
    if (real !== root && !real.startsWith(root + sep)) {
      throw new SiteBuildError(
        "bad-path",
        `Include path "${virtual}" must stay inside /_inc/ (from ${where})`
      );
    }
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new SiteBuildError(
        "missing-include",
        `Could not read include "${virtual}" (from ${where}): ${detail}`
      );
    }
    rawCache.set(virtual, text);
    return text;
  }

  function includePath(virtual: string): string {
    return join(includeRoot, ...virtual.slice(INCLUDE_ROOT.length).split("/"));
  }

  return { stitch };
}

/**
 * Marks the current page's nav link. This is a string splice of the first
 * `<a href="{active}">`, not an HTML parse, so the include keeps that exact
 * form and the build does not reserialize the document.
 */
function applyActive(html: string, active: string): string {
  const needle = `<a href="${active}">`;
  const at = html.indexOf(needle);
  if (at < 0) return html;
  const replacement = `<a href="${active}" class="active" aria-current="page">`;
  return html.slice(0, at) + replacement + html.slice(at + needle.length);
}

function normalizeVirtual(virtual: string, where: string): string {
  const fail = (): never => {
    throw new SiteBuildError(
      "bad-path",
      `Include path "${virtual}" must stay inside /_inc/ (from ${where})`
    );
  };
  if (virtual.includes("\\") || virtual.includes("\0") || !virtual.startsWith(INCLUDE_ROOT)) {
    fail();
  }
  const rest = virtual.slice(INCLUDE_ROOT.length);
  const parts = rest.split("/");
  if (rest === "" || parts.some((part) => part === "" || part === "." || part === "..")) fail();
  return `${INCLUDE_ROOT}${parts.join("/")}`;
}

const ATTRIBUTE = /^\s*([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/;

function parseDirective(raw: string, where: string): Directive {
  if (raw.length > 0 && !/^\s/.test(raw)) {
    throw new SiteBuildError("bad-include", `Unrecognized include in ${where}: ${snippet(raw)}`);
  }
  const attrs = new Map<string, string>();
  let rest = raw;
  while (rest.length > 0) {
    const match = ATTRIBUTE.exec(rest);
    if (!match) break;
    const name = match[1]?.toLowerCase();
    if (!name) break;
    if (attrs.has(name)) {
      throw new SiteBuildError(
        "bad-include",
        `Duplicate attribute "${name}" on include in ${where}`
      );
    }
    attrs.set(name, match[2] ?? match[3] ?? "");
    const whole = match[0];
    if (whole === undefined) break;
    rest = rest.slice(whole.length);
  }
  if (rest.trim() !== "") {
    throw new SiteBuildError("bad-include", `Unrecognized include in ${where}: ${snippet(raw)}`);
  }
  const virtual = attrs.get("virtual");
  if (virtual === undefined) {
    throw new SiteBuildError("bad-include", `Include in ${where} is missing virtual="/_inc/..."`);
  }
  for (const name of attrs.keys()) {
    if (name !== "virtual" && name !== "active") {
      throw new SiteBuildError(
        "bad-include",
        `Unrecognized include attribute "${name}" in ${where}`
      );
    }
  }
  const active = attrs.get("active");
  return active === undefined ? { virtual } : { virtual, active };
}

function snippet(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  const body = compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
  return `<!--#include ${body}-->`;
}
