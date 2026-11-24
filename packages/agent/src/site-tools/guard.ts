export type ToolCallRecord = {
  tool: string;
  mode: "read" | "dry-run" | "apply" | "refuse" | "retry";
  files: string[];
  dryRunId?: string;
  at: string;
  error?: string;
};

/** One automatic retry. A second failure ends the change. */
export const HAND_EDIT_RETRY_LIMIT = 1;

/**
 * Trusted instruction for the editor after a hand-edit was discarded.
 * It is not written to the chat.
 */
export const HAND_EDIT_GUIDANCE = `The edit you just made was discarded. It changed too many page files by hand.
Redo that change with find_pages, read_page, edit_include, set_meta, retag, replace_text, and list_links.
Prefer edit_include when the same block is on many pages.
The note for the site owner stays plain language. Do not name tools, settings, or individual people. Say our team if someone has to follow up.`;

const TOOL_NAMES = [
  "find_pages",
  "read_page",
  "edit_include",
  "set_meta",
  "retag",
  "replace_text",
  "list_links",
  "hand_edit_guard"
];

/** Drop a reply that would show tool names in the chat. */
export function customerReply(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (TOOL_NAMES.some((name) => trimmed.includes(name))) return undefined;
  return trimmed;
}

export function isPageFile(path: string): boolean {
  const normal = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normal || normal.startsWith("/") || normal.split("/").includes("..")) return false;
  const lower = normal.toLowerCase();
  if (!lower.endsWith(".html") && !lower.endsWith(".htm")) return false;
  return !normal
    .split("/")
    .some(
      (part) =>
        part === "_inc" || part === "_templates" || part === ".flagstage" || part === ".opencode"
    );
}

function sameBytes(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (!left || !right || left.byteLength !== right.byteLength) return false;
  return Buffer.compare(left, right) === 0;
}

/**
 * Page files whose bytes differ and that no applied tool call listed.
 * Includes, templates, and tool-written pages are not hand-edits.
 */
export function handEditedPages(
  before: Map<string, Uint8Array>,
  after: Map<string, Uint8Array>,
  toolLog: readonly { mode: string; files: readonly string[] }[]
): string[] {
  const touched = new Set<string>();
  for (const call of toolLog) {
    if (call.mode !== "apply") continue;
    for (const file of call.files) touched.add(file.replaceAll("\\", "/").replace(/^\.\//, ""));
  }
  const paths = new Set<string>([...before.keys(), ...after.keys()]);
  const hand: string[] = [];
  for (const path of paths) {
    const normal = path.replaceAll("\\", "/").replace(/^\.\//, "");
    if (!isPageFile(normal) || touched.has(normal)) continue;
    if (!sameBytes(before.get(path) ?? before.get(normal), after.get(path) ?? after.get(normal))) {
      hand.push(normal);
    }
  }
  hand.sort();
  return hand;
}

export function guardRecord(mode: "refuse" | "retry", files: string[]): ToolCallRecord {
  return { tool: "hand_edit_guard", mode, files, at: new Date().toISOString() };
}
