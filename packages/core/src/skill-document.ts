import { readYamlScalar, type SkillFile } from "./skill-file";

/**
 * One skill file: front matter plus markdown. Parsing keeps every byte in a
 * block's raw text, so an edit replaces one region and the rest stays put.
 */

export type SkillListItem = {
  depth: number;
  marker: "-" | "*" | "+";
  text: string;
  /** Exact indent, marker, and the spaces that follow the marker. */
  prefix: string;
  raw: string;
  start: number;
  end: number;
};

export type SkillBlock =
  | {
      id: string;
      kind: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      text: string;
      raw: string;
      start: number;
      end: number;
    }
  | {
      id: string;
      kind: "paragraph" | "raw";
      text: string;
      raw: string;
      start: number;
      end: number;
    }
  | {
      id: string;
      kind: "list";
      items: SkillListItem[];
      raw: string;
      start: number;
      end: number;
    }
  | {
      id: string;
      kind: "blank";
      raw: string;
      start: number;
      end: number;
    };

export type SkillDocument = {
  source: string;
  preamble: string;
  description: string;
  blocks: SkillBlock[];
};

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type NewBlock = WithoutId<SkillBlock>;

const FRONT = /^(\uFEFF?)---(\r?\n)([\s\S]*?)\r?\n---[ \t]*(\r?\n)?/;
const HEADING = /^( {0,3})(#{1,6})([ \t]+)(.*)$/;
const LIST = /^([ \t]*)([-*+])([ \t]+)(.*)$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

type Front = { preamble: string; inner: string; innerStart: number };

function frontOf(source: string): Front | null {
  const match = FRONT.exec(source);
  if (!match) return null;
  const inner = match[3] ?? "";
  const innerStart = (match[1]?.length ?? 0) + 3 + (match[2]?.length ?? 0);
  return { preamble: match[0], inner, innerStart };
}

function trailingNewline(raw: string): string {
  if (raw.endsWith("\r\n")) return "\r\n";
  if (raw.endsWith("\n")) return "\n";
  return "";
}

function stripTrailingNewline(raw: string): string {
  if (raw.endsWith("\r\n")) return raw.slice(0, -2);
  if (raw.endsWith("\n")) return raw.slice(0, -1);
  return raw;
}

type Line = { text: string; start: number; end: number };

function linesFrom(source: string, start: number): Line[] {
  const lines: Line[] = [];
  let index = start;
  while (index < source.length) {
    const rest = source.slice(index);
    const breakAt = rest.search(/\r?\n/);
    if (breakAt === -1) {
      lines.push({ text: rest, start: index, end: source.length });
      break;
    }
    const newline = rest.startsWith("\r\n", breakAt) ? 2 : 1;
    const end = index + breakAt + newline;
    lines.push({ text: rest.slice(0, breakAt), start: index, end });
    index = end;
  }
  return lines;
}

function fenceMark(line: string): { char: string; size: number } | null {
  const match = FENCE.exec(line);
  const token = match?.[2];
  const char = token?.[0];
  if (!token || !char) return null;
  return { char, size: token.length };
}

function closesFence(line: string, mark: { char: string; size: number }): boolean {
  return new RegExp(`^( {0,3})${mark.char === "`" ? "`" : "~"}{${mark.size},}[ \\t]*$`).test(line);
}

function indentWidth(indent: string): number {
  let width = 0;
  for (const char of indent) width += char === "\t" ? 2 : 1;
  return width;
}

function listItems(source: string, lines: Line[]): SkillListItem[] {
  const stack: number[] = [];
  return lines.map((line) => {
    const match = LIST.exec(line.text);
    const indent = match?.[1] ?? "";
    const marker = (match?.[2] ?? "-") as "-" | "*" | "+";
    const gap = match?.[3] ?? " ";
    const text = match?.[4] ?? line.text;
    const width = indentWidth(indent);
    while (stack.length > 0 && width < stack[stack.length - 1]!) stack.pop();
    if (stack.length === 0 || width > stack[stack.length - 1]!) stack.push(width);
    return {
      depth: stack.length - 1,
      marker,
      text,
      prefix: `${indent}${marker}${gap}`,
      raw: source.slice(line.start, line.end),
      start: line.start,
      end: line.end
    };
  });
}

export function parseSkillDocument(source: string): SkillDocument {
  const front = frontOf(source);
  const preamble = front?.preamble ?? (source.startsWith("\uFEFF") ? "\uFEFF" : "");
  const lines = linesFrom(source, preamble.length);
  const blocks: SkillBlock[] = [];
  let cursor = 0;
  const push = (block: NewBlock) => {
    blocks.push({ ...block, id: `b${blocks.length}` } as SkillBlock);
  };
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line) break;
    if (line.text.trim() === "") {
      let end = cursor + 1;
      while (end < lines.length && lines[end]?.text.trim() === "") end += 1;
      const last = lines[end - 1] ?? line;
      push({
        kind: "blank",
        raw: source.slice(line.start, last.end),
        start: line.start,
        end: last.end
      });
      cursor = end;
      continue;
    }
    const mark = fenceMark(line.text);
    if (mark) {
      let end = cursor + 1;
      while (end < lines.length && !closesFence(lines[end]?.text ?? "", mark)) end += 1;
      if (end < lines.length) end += 1;
      const last = lines[end - 1] ?? line;
      const raw = source.slice(line.start, last.end);
      push({
        kind: "raw",
        text: stripTrailingNewline(raw),
        raw,
        start: line.start,
        end: last.end
      });
      cursor = end;
      continue;
    }
    const heading = HEADING.exec(line.text);
    if (heading) {
      const level = heading[2]?.length ?? 1;
      push({
        kind: "heading",
        level: (level < 1 ? 1 : level > 6 ? 6 : level) as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[4] ?? "",
        raw: source.slice(line.start, line.end),
        start: line.start,
        end: line.end
      });
      cursor += 1;
      continue;
    }
    if (LIST.test(line.text)) {
      let end = cursor + 1;
      while (end < lines.length && LIST.test(lines[end]?.text ?? "")) end += 1;
      const last = lines[end - 1] ?? line;
      const itemLines = lines.slice(cursor, end);
      push({
        kind: "list",
        items: listItems(source, itemLines),
        raw: source.slice(line.start, last.end),
        start: line.start,
        end: last.end
      });
      cursor = end;
      continue;
    }
    let end = cursor + 1;
    while (end < lines.length) {
      const next = lines[end];
      if (!next) break;
      if (
        next.text.trim() === "" ||
        fenceMark(next.text) ||
        HEADING.test(next.text) ||
        LIST.test(next.text)
      ) {
        break;
      }
      end += 1;
    }
    const last = lines[end - 1] ?? line;
    const raw = source.slice(line.start, last.end);
    push({
      kind: "paragraph",
      text: stripTrailingNewline(raw),
      raw,
      start: line.start,
      end: last.end
    });
    cursor = end;
  }
  return {
    source,
    preamble,
    description: descriptionOf(source),
    blocks
  };
}

export function serializeSkillDocument(doc: SkillDocument): string {
  return doc.preamble + doc.blocks.map((block) => block.raw).join("");
}

function descriptionOf(source: string): string {
  const front = frontOf(source);
  if (!front) return "";
  const line = /^[ \t]*description:[ \t]*(.*)$/m.exec(front.inner);
  return readYamlScalar(line?.[1] ?? "");
}

function isSafePlain(value: string): boolean {
  if (!value || /^\s|\s$/.test(value)) return false;
  if (/[:#{}[\],&*!|>%@`]/.test(value)) return false;
  if (/^(?:true|false|null|yes|no|on|off|~)$/i.test(value)) return false;
  if (/^[-+0-9]/.test(value)) return false;
  if (/["'\\]/.test(value)) return false;
  return true;
}

function quoteScalar(previous: string, value: string): string {
  const trimmed = previous.trim();
  const double = trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2;
  const single = trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;
  if (single && !value.includes("'")) return `'${value}'`;
  if (single) return `'${value.replace(/'/g, "''")}'`;
  if (double || !isSafePlain(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function replaceFrontValue(source: string, key: "name" | "description", value: string): string {
  const front = frontOf(source);
  if (!front) {
    if (!value && key === "description") return source;
    const quoted = quoteScalar('""', value);
    const line = key === "name" && isSafePlain(value) ? `name: ${value}` : `${key}: ${quoted}`;
    const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
    return `${bom}---\n${line}\n---\n\n${source.slice(bom.length)}`;
  }
  const found = new RegExp(`^([ \\t]*${key}:[ \\t]*)(.*)$`, "m").exec(front.inner);
  if (!found) {
    if (!value && key === "description") return source;
    const quoted = quoteScalar('""', value);
    const line = key === "name" && isSafePlain(value) ? `name: ${value}` : `${key}: ${quoted}`;
    const nameLine = /^[ \t]*name:.*$/m.exec(front.inner);
    if (key === "description" && nameLine) {
      const at = front.innerStart + nameLine.index + nameLine[0].length;
      const newline = source.startsWith("\r\n", at) ? 2 : source[at] === "\n" ? 1 : 0;
      const insertAt = at + newline;
      const lead = newline === 2 ? "\r\n" : "\n";
      return `${source.slice(0, insertAt)}${line}${lead}${source.slice(insertAt)}`;
    }
    const lead = source.startsWith("\r\n", front.innerStart) ? "\r\n" : "\n";
    return `${source.slice(0, front.innerStart)}${line}${lead}${source.slice(front.innerStart)}`;
  }
  if (readYamlScalar(found[2] ?? "") === value) return source;
  const valueStart = front.innerStart + found.index + (found[1]?.length ?? 0);
  const valueEnd = valueStart + (found[2]?.length ?? 0);
  return source.slice(0, valueStart) + quoteScalar(found[2] ?? "", value) + source.slice(valueEnd);
}

export function withSkillDescription(source: string, description: string): string {
  return replaceFrontValue(source, "description", description);
}

export function withSkillName(source: string, name: string): string {
  return replaceFrontValue(source, "name", name);
}

function blockById(source: string, blockId: string): SkillBlock | undefined {
  return parseSkillDocument(source).blocks.find((block) => block.id === blockId);
}

export function withBlockText(source: string, blockId: string, text: string): string {
  const block = blockById(source, blockId);
  if (!block || block.kind === "blank" || block.kind === "list") return source;
  if (block.kind === "heading") {
    if (text === block.text) return source;
    const line = stripTrailingNewline(block.raw);
    const match = HEADING.exec(line);
    const prefix = match ? `${match[1] ?? ""}${match[2] ?? "#"}${match[3] ?? " "}` : "# ";
    return (
      source.slice(0, block.start) +
      prefix +
      text +
      trailingNewline(block.raw) +
      source.slice(block.end)
    );
  }
  if (text === block.text) return source;
  return source.slice(0, block.start) + text + trailingNewline(block.raw) + source.slice(block.end);
}

export function withListItemText(
  source: string,
  blockId: string,
  index: number,
  text: string
): string {
  const block = blockById(source, blockId);
  if (!block || block.kind !== "list") return source;
  const item = block.items[index];
  if (!item) return source;
  if (!text.includes("\n") && text === item.text) return source;
  const parts = text.split("\n");
  const newline = trailingNewline(item.raw) || "\n";
  const lines = parts.map((part, partIndex) => {
    const end = partIndex === parts.length - 1 ? trailingNewline(item.raw) : newline;
    return `${item.prefix}${part.replace(/\r$/, "")}${end}`;
  });
  return source.slice(0, item.start) + lines.join("") + source.slice(item.end);
}

export function withAppendedText(source: string, text: string): string {
  if (!text) return source;
  const separator = source.endsWith("\n") || source.length === 0 ? "" : "\n";
  const body = text.endsWith("\n") ? text : `${text}\n`;
  return `${source}${separator}${body}`;
}

/** Account skills store the markdown body apart from the front matter. */
export function skillSourceFromParts(
  skill: Pick<SkillFile, "name" | "description" | "body">
): string {
  const name = skill.name.replace(/\s+/g, " ").trim() || "Skill";
  const nameLine = isSafePlain(name) ? `name: ${name}` : `name: ${quoteScalar('""', name)}`;
  const description = quoteScalar('""', skill.description);
  return `---\n${nameLine}\ndescription: ${description}\n---\n\n${skill.body}`;
}

export function skillPartsFromSource(source: string, fallbackName: string): SkillFile {
  const front = frontOf(source);
  if (!front) return { name: fallbackName, description: "", body: source.replace(/^\uFEFF/, "") };
  const name = readYamlScalar(/^name:\s*(.*)$/m.exec(front.inner)?.[1] ?? "") || fallbackName;
  let body = source.slice(front.preamble.length);
  if (body.startsWith("\r\n")) body = body.slice(2);
  else if (body.startsWith("\n")) body = body.slice(1);
  return { name, description: descriptionOf(source), body };
}

const skillDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

/** Browsers submit textarea newlines as CRLF. The stored skill file uses LF. */
export function normalizeSkillNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

/**
 * Keep the original file bytes when the saved text is unchanged.
 * The name is the skill's existing name, never a value typed in the editor.
 */
export function skillFileBytes(original: Uint8Array, submitted: string, name: string): Uint8Array {
  const decoded = skillDecoder.decode(original);
  const next = withSkillName(normalizeSkillNewlines(submitted), name);
  if (next === decoded || next === normalizeSkillNewlines(decoded)) return original;
  return new TextEncoder().encode(next);
}
