import { normalizeSitePath } from "./site-url";
import type { FidelityItem, MappedForm } from "./types";

export type AnnotatedForm = MappedForm & {
  /** Substring of the opening form tag. The crawl points that form at the lead endpoint. */
  marker?: string;
};

export type PageAnnotation = {
  forms?: FidelityItem[];
  plugins?: FidelityItem[];
  formsMapped?: AnnotatedForm[];
};

const SKIP = /^(?:#|mailto:|data:|javascript:|tel:)/i;

/**
 * Root-relative when the target was imported. Absolute on the source origin
 * when it was not. Other origins, fragments, and non-http URLs stay put.
 */
export function rewriteResourceUrl(
  raw: string,
  origin: URL,
  imported: ReadonlySet<string>
): string {
  const value = raw.trim();
  if (!value || SKIP.test(value)) return raw;
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return raw;
  }
  if (url.origin !== origin.origin) return raw;
  const path = normalizeSitePath(`${url.pathname}${url.search}`, origin);
  if (!path) return raw;
  const suffix = `${url.search}${url.hash}`;
  if (imported.has(path)) return `${path}${suffix}`;
  return `${origin.origin}${path}${suffix}`;
}

export function rewriteCapturedHtml(
  html: string,
  origin: URL,
  imported: ReadonlySet<string>
): string {
  const rewrite = (raw: string) => rewriteResourceUrl(raw, origin, imported);
  let next = html.replace(
    /\b(href|src|action)=(["'])([^"']*)\2/gi,
    (_match, attr: string, quote: string, value: string) =>
      `${attr}=${quote}${rewrite(value)}${quote}`
  );
  next = next.replace(/\bsrcset=(["'])([^"']*)\1/gi, (_match, quote: string, value: string) => {
    const rewritten = value
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return part;
        const bits = trimmed.split(/\s+/);
        const url = bits[0];
        if (!url) return part;
        bits[0] = rewrite(url);
        return bits.join(" ");
      })
      .join(", ");
    return `srcset=${quote}${rewritten}${quote}`;
  });
  next = next.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (_match, quote: string, value: string) => `url(${quote}${rewrite(value.trim())}${quote})`
  );
  return next;
}

export function applyFormActions(
  html: string,
  appOrigin: string,
  siteId: string,
  forms: readonly AnnotatedForm[]
): string {
  let next = html;
  for (const form of forms) {
    if (!form.marker) continue;
    const marker = form.marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const action = `${appOrigin}/f/${siteId}/${form.formKey}`;
    next = applyOneFormAction(next, marker, action);
  }
  return next;
}

const ATTR = String.raw`(?:"[^"]*"|'[^']*'|[^\s>]+)`;

function applyOneFormAction(html: string, marker: string, action: string): string {
  const full = new RegExp(`<form\\b[^>]*${marker}[^>]*>([\\s\\S]*?)</form>`, "i");
  const replaced = html.replace(full, (match) => rewriteMappedForm(match, action));
  if (replaced !== html) return replaced;
  return html.replace(new RegExp(`<form\\b[^>]*${marker}[^>]*>`, "i"), (tag) =>
    rewriteOpenTag(tag, action)
  );
}

function rewriteMappedForm(full: string, action: string): string {
  const openEnd = endOfOpenTag(full);
  const open = rewriteOpenTag(full.slice(0, openEnd), action);
  const rest = full.slice(openEnd).replace(new RegExp(String.raw`\sformaction\s*=\s*${ATTR}`, "gi"), "");
  return open + rest;
}

function rewriteOpenTag(tag: string, action: string): string {
  const stripped = tag
    .replace(new RegExp(String.raw`\saction\s*=\s*${ATTR}`, "gi"), "")
    .replace(new RegExp(String.raw`\smethod\s*=\s*${ATTR}`, "gi"), "")
    .replace(new RegExp(String.raw`\sformaction\s*=\s*${ATTR}`, "gi"), "")
    .replace(new RegExp(String.raw`\son[a-z]+\s*=\s*${ATTR}`, "gi"), "");
  return stripped.replace(/<form\b/i, `<form method="post" action="${action}"`);
}

function endOfOpenTag(full: string): number {
  let quote = "";
  for (let index = 0; index < full.length; index += 1) {
    const ch = full[index] ?? "";
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return index + 1;
  }
  const fallback = full.indexOf(">");
  return fallback < 0 ? full.length : fallback + 1;
}

export function mappedForms(forms: readonly AnnotatedForm[]): MappedForm[] {
  return forms.map((form) => ({ formKey: form.formKey, name: form.name, page: form.page }));
}
