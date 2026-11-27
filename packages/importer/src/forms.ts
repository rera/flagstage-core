import type { AnnotatedForm } from "./rewrite";
import type { FidelityItem } from "./types";

/**
 * The `/f/{siteId}/{formKey}` route parses urlencoded and multipart bodies
 * and stores every string field. File parts are `File` objects and are
 * dropped. A form with a file field is reported and left unchanged.
 */
const MARKER_ATTR = "data-flagstage-form";

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
  "source",
  "track",
  "wbr"
]);

const SKIP_INPUT = new Set(["hidden", "submit", "button", "reset", "image"]);

const IFRAME_HOSTS = [
  "jotform.com",
  "typeform.com",
  "wufoo.com",
  "formstack.com",
  "cognitoforms.com",
  "paperform.co",
  "fillout.com"
];

const TOPICAL =
  /\b(form|contact|request|quote|book|booking|rsvp|apply|application|survey|order|inquiry|enquiry|newsletter|sign|signup|question|message|schedule|reserve|reservation|appointment|register|registration|subscribe|subscription|upload|feedback|support|help|visit|tee|event|guest|party|demo|consult|estimate|ticket|donation|volunteer|waitlist|callback|info|information|lesson|class|workshop|table|room|stay|tour)\b/i;

type Field = { name: string; type: string };

type RawForm = {
  tag: string;
  inner: string;
  start: number;
  tagEnd: number;
  ancestors: string[];
  inIframe: boolean;
};

type RawIframe = { src: string; label: string; hasForm: boolean };

type SeenTag = {
  name: string;
  start: number;
  end: number;
  closing: boolean;
  selfClosing: boolean;
};

export function detectPageForms(input: {
  html: string;
  page: string;
  origin: URL;
  claimed?: readonly AnnotatedForm[];
}): { html: string; mapped: AnnotatedForm[]; notes: FidelityItem[] } {
  const claimed = input.claimed ?? [];
  const scanned = scan(input.html);
  const notes: FidelityItem[] = [];
  const pending: Array<{ form: RawForm; key: string; name: string; marker: string | null }> = [];
  const used = new Set(claimed.map((item) => item.formKey));
  const ids = uniqueValues(scanned.forms, "id");
  const names = uniqueValues(scanned.forms, "name");

  scanned.forms.forEach((form, index) => {
    if (form.inIframe) return;
    const fields = fieldsIn(form.inner);
    if (fields.length === 0) return;
    if (isClaimed(form, claimed)) return;
    const excluded = exclusion(form, fields, input.origin);
    if (excluded) {
      notes.push({ page: input.page, kind: excluded.kind, detail: excluded.detail });
      return;
    }
    const key = uniqueKey(
      formKey(input.page, ids.get(form) ?? "", names.get(form) ?? "", index),
      index,
      used
    );
    used.add(key);
    const marker =
      existingMarker(form.tag, key) ??
      idMarker(form.tag, ids.get(form)) ??
      nameMarker(form.tag, names.get(form));
    pending.push({
      form,
      key,
      name: formName(input.html, form, input.page),
      marker
    });
  });

  const fallback = `Form on ${displayPath(input.page)}`;
  let fallbackCount = 0;
  for (const item of pending) {
    if (item.name !== fallback) continue;
    fallbackCount += 1;
    if (fallbackCount > 1) item.name = `${fallback} ${fallbackCount}`;
  }

  let html = input.html;
  const mapped: AnnotatedForm[] = [];
  const injections = pending
    .filter((item) => !item.marker)
    .sort((left, right) => right.form.tagEnd - left.form.tagEnd);
  for (const item of injections) {
    const marker = `${MARKER_ATTR}="${item.key}"`;
    html = `${html.slice(0, item.form.tagEnd - 1)} ${marker}${html.slice(item.form.tagEnd - 1)}`;
    item.marker = marker;
  }
  for (const item of pending) {
    if (!item.marker) continue;
    mapped.push({ formKey: item.key, name: item.name, page: input.page, marker: item.marker });
    notes.push({
      page: input.page,
      kind: "form",
      detail: `Form "${item.name}" was pointed at the site form endpoint.`
    });
  }
  for (const frame of scanned.iframes) {
    if (!frame.hasForm && !isFormIframe(frame.src, frame.label)) continue;
    notes.push({
      page: input.page,
      kind: "iframe-form",
      detail: "A form inside an iframe was left unchanged."
    });
  }
  return { html, mapped, notes };
}

function exclusion(
  form: RawForm,
  fields: Field[],
  origin: URL
): { kind: string; detail: string } | null {
  if (isSearch(form, fields)) {
    return { kind: "search", detail: "A search form was left unchanged." };
  }
  if (isLogin(form, fields)) {
    return { kind: "login", detail: "A login or password form was left unchanged." };
  }
  if (isComment(form)) {
    return { kind: "comments", detail: "A comment form was left unchanged." };
  }
  if (isCheckout(form)) {
    return { kind: "checkout", detail: "A cart, checkout, or payment form was left unchanged." };
  }
  const action = attr(form.tag, "action");
  if (isExternal(action, form.inner, origin)) {
    return { kind: "external-form", detail: "A form that posts to another site was left unchanged." };
  }
  if (fields.some((field) => field.type === "file")) {
    return {
      kind: "file-upload",
      detail: "A form with a file field was left unchanged. The form endpoint does not store uploaded files."
    };
  }
  return null;
}

function isSearch(form: RawForm, fields: Field[]): boolean {
  const blob = `${form.ancestors.join(" ")} ${form.tag}`;
  if (/\brole\s*=\s*(?:"search"|'search')/i.test(blob)) return true;
  if (actionIsSearch(attr(form.tag, "action"))) return true;
  if (fields.length !== 1) return false;
  const field = fields[0];
  if (!field || field.type === "password" || field.type === "file") return false;
  if (field.type === "search") return true;
  return /^(q|s|search)$/i.test(field.name);
}

function actionIsSearch(action: string): boolean {
  return /(?:^|[/?&#=._-])search(?:[/?&#=._-]|$)/i.test(action);
}

function isLogin(form: RawForm, fields: Field[]): boolean {
  if (fields.some((field) => field.type === "password")) return true;
  return /\b(login|log-in|loginform|signin|sign-in|wp-login)\b/i.test(identity(form));
}

function isComment(form: RawForm): boolean {
  return /\b(commentform|comment-form|wp-comments-post)\b/i.test(identity(form));
}

function isCheckout(form: RawForm): boolean {
  if (/\b(checkout|cart|payment|add-to-cart)\b/i.test(identity(form))) return true;
  return /name\s*=\s*(?:"|')(?:add-to-cart|payment_method|cardnumber|card-number|cc-number|card_number)["']/i.test(
    form.inner
  );
}

function identity(form: RawForm): string {
  return `${attr(form.tag, "id")} ${attr(form.tag, "class")} ${attr(form.tag, "name")} ${attr(form.tag, "action")}`;
}

function isExternal(action: string, inner: string, origin: URL): boolean {
  if (postsElsewhere(action, origin)) return true;
  if (action.trim()) return false;
  for (const match of inner.matchAll(/\sformaction\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const target = match[1] ?? match[2] ?? match[3] ?? "";
    if (postsElsewhere(target, origin)) return true;
  }
  return false;
}

function postsElsewhere(action: string, origin: URL): boolean {
  const value = decode(action.trim());
  if (!value || value.startsWith("#") || /^(?:mailto:|javascript:|tel:|sms:)/i.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return hostKey(url) !== hostKey(origin);
}

function hostKey(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function isFormIframe(src: string, label: string): boolean {
  if (/\bforms?\b/i.test(label)) return true;
  if (!src) return false;
  if (/docs\.google\.com\/forms|forms\.gle/i.test(src)) return true;
  let host = "";
  try {
    host = new URL(src, "https://placeholder.invalid").hostname.toLowerCase();
  } catch {
    return false;
  }
  return IFRAME_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
}

function isClaimed(form: RawForm, claimed: readonly AnnotatedForm[]): boolean {
  if (claimed.length === 0) return false;
  const blob = `${form.ancestors.join("\n")}\n${form.tag}\n${form.inner}`;
  return claimed.some((item) => Boolean(item.marker) && blob.includes(item.marker ?? ""));
}

function fieldsIn(inner: string): Field[] {
  const fields: Field[] = [];
  for (const match of inner.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
    const kind = (match[1] ?? "").toLowerCase();
    const tag = match[2] ?? "";
    if (kind === "textarea" || kind === "select") {
      fields.push({ name: attr(tag, "name"), type: kind });
      continue;
    }
    const type = (attr(tag, "type") || "text").toLowerCase();
    if (SKIP_INPUT.has(type)) continue;
    fields.push({ name: attr(tag, "name"), type });
  }
  return fields;
}

function formName(html: string, form: RawForm, page: string): string {
  const labelled = labelledBy(html, form.tag);
  const legend = textContent(form.inner.match(/<legend\b[^>]*>([\s\S]*?)<\/legend>/i)?.[1] ?? "");
  const innerHeading = textContent(form.inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? "");
  const before = precedingHeading(html, form.start);
  const candidates = [labelled, legend, innerHeading, before, attr(form.tag, "aria-label"), humanize(attr(form.tag, "id"))];
  for (const candidate of candidates) {
    const label = usableLabel(candidate);
    if (label) return label;
  }
  return `Form on ${displayPath(page)}`;
}

function labelledBy(html: string, tag: string): string {
  const id = attr(tag, "aria-labelledby").split(/\s+/)[0] ?? "";
  if (!id) return "";
  const pattern = new RegExp(
    `<([a-zA-Z0-9:-]+)\\b[^>]*\\bid\\s*=\\s*(?:"${escapeRegExp(id)}"|'${escapeRegExp(id)}')[^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i"
  );
  return textContent(html.match(pattern)?.[2] ?? "");
}

function precedingHeading(html: string, start: number): string {
  let window = html.slice(Math.max(0, start - 1500), start);
  const close = window.lastIndexOf("</form");
  if (close >= 0) window = window.slice(close);
  const headings = [...window.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  return textContent(headings.at(-1)?.[1] ?? "");
}

function usableLabel(value: string): string {
  const text = textContent(value);
  if (!text || text.length > 80 || text.includes("@")) return "";
  if (isPersonalName(text)) return "";
  return text;
}

function isPersonalName(value: string): boolean {
  if (/^(?:your\s+)?(?:full\s+|first\s+|last\s+)?name$/i.test(value)) return true;
  if (TOPICAL.test(value)) return false;
  const words = value.split(" ");
  if (words.length < 2 || words.length > 3) return false;
  return words.every((word) => /^[A-Za-z][a-z]+(?:[-'][A-Za-z][a-z]+)?$/.test(word));
}

function humanize(value: string): string {
  const words = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!words || words === "form") return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formKey(page: string, id: string, name: string, index: number): string {
  const token = slug(id) || slug(name) || String(index + 1);
  return `${pageSlug(page)}-${token}`.replace(/-+$/g, "").slice(0, 80);
}

function uniqueKey(base: string, index: number, used: Set<string>): string {
  let n = index + 1;
  let next = base;
  while (used.has(next) && n < index + 100) {
    next = `${base.slice(0, 64)}-${n}`.slice(0, 80);
    n += 1;
  }
  return next;
}

function pageSlug(page: string): string {
  const path = (page.split("?")[0] ?? "/").replace(/^\/+|\/+$/g, "");
  if (!path) return "home";
  const parts = path
    .split("/")
    .map((part) => slug(decodePath(part)))
    .filter(Boolean);
  return parts.join("--") || "home";
}

function displayPath(page: string): string {
  const raw = (page.split("?")[0] ?? "/").trim();
  if (!raw || raw === "/") return "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path.replace(/\/+$/g, "") || "/";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function uniqueValues(forms: RawForm[], name: "id" | "name"): Map<RawForm, string> {
  const groups = new Map<string, RawForm[]>();
  for (const form of forms) {
    const value = attr(form.tag, name);
    if (!value) continue;
    const list = groups.get(value) ?? [];
    list.push(form);
    groups.set(value, list);
  }
  const unique = new Map<RawForm, string>();
  for (const [value, list] of groups) {
    const form = list[0];
    if (list.length === 1 && form) unique.set(form, value);
  }
  return unique;
}

function existingMarker(tag: string, key: string): string | null {
  const marker = `${MARKER_ATTR}="${key}"`;
  return tag.includes(marker) ? marker : null;
}

function idMarker(tag: string, id: string | undefined): string | null {
  if (!id) return null;
  return exactAttr(tag, "id");
}

function nameMarker(tag: string, name: string | undefined): string | null {
  if (!name) return null;
  return exactAttr(tag, "name");
}

function exactAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i"));
  return match ? match[0].trim() : null;
}

function attr(tag: string, name: string): string {
  const match = tag.match(
    new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  return decode(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function textContent(value: string): string {
  return decode(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scan(html: string): { forms: RawForm[]; iframes: RawIframe[] } {
  const forms: RawForm[] = [];
  const iframes: RawIframe[] = [];
  const stack: Array<{ name: string; raw: string }> = [];
  const iframeStack: RawIframe[] = [];
  let open: { start: number; tagEnd: number; tag: string; ancestors: string[] } | null = null;

  const closeOpen = (end: number, popForm: boolean) => {
    if (!open) return;
    const frame = iframeStack.at(-1);
    if (frame) frame.hasForm = true;
    forms.push({
      tag: open.tag,
      inner: html.slice(open.tagEnd, end),
      start: open.start,
      tagEnd: open.tagEnd,
      ancestors: open.ancestors,
      inIframe: iframeStack.length > 0
    });
    if (popForm) pop(stack, "form");
    open = null;
  };

  walkTags(html, (tag) => {
    if (tag.closing) {
      if (tag.name === "form") closeOpen(tag.start, false);
      if (tag.name === "iframe") iframeStack.pop();
      pop(stack, tag.name);
      return;
    }
    if (tag.name === "form") {
      closeOpen(tag.start, true);
      open = {
        start: tag.start,
        tagEnd: tag.end,
        tag: html.slice(tag.start, tag.end),
        ancestors: stack.map((item) => item.raw)
      };
    }
    if (tag.name === "iframe") {
      const raw = html.slice(tag.start, tag.end);
      const frame = {
        src: attr(raw, "src"),
        label: `${attr(raw, "title")} ${attr(raw, "name")} ${attr(raw, "aria-label")}`,
        hasForm: false
      };
      iframes.push(frame);
      if (!tag.selfClosing) iframeStack.push(frame);
    }
    if (!tag.selfClosing && !VOID.has(tag.name)) {
      stack.push({ name: tag.name, raw: html.slice(tag.start, tag.end) });
    }
  });
  closeOpen(html.length, true);
  return { forms, iframes };
}

function pop(stack: Array<{ name: string }>, name: string) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.name !== name) continue;
    stack.splice(index, 1);
    return;
  }
}

function walkTags(html: string, visit: (tag: SeenTag) => void) {
  const lower = html.toLowerCase();
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start < 0) return;
    if (lower.startsWith("<!--", start)) {
      const end = lower.indexOf("-->", start + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    const tag = readTag(html, start);
    if (!tag) {
      index = start + 1;
      continue;
    }
    if ((tag.name === "script" || tag.name === "style") && !tag.closing) {
      visit(tag);
      const end = lower.indexOf(`</${tag.name}`, tag.end);
      index = end < 0 ? html.length : end;
      continue;
    }
    visit(tag);
    index = tag.end;
  }
}

function readTag(html: string, start: number): SeenTag | null {
  if (html[start] !== "<") return null;
  let index = start + 1;
  const closing = html[index] === "/";
  if (closing) index += 1;
  else if (html[index] === "!" || html[index] === "?") return null;
  const nameStart = index;
  while (index < html.length && /[A-Za-z0-9:_-]/.test(html[index] ?? "")) index += 1;
  if (index === nameStart) return null;
  const name = html.slice(nameStart, index).toLowerCase();
  let quote = "";
  for (; index < html.length; index += 1) {
    const ch = html[index] ?? "";
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch !== ">") continue;
    const raw = html.slice(start, index + 1);
    return { name, start, end: index + 1, closing, selfClosing: /\/\s*>$/.test(raw) };
  }
  return null;
}
