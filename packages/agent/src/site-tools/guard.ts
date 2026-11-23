export type ToolCallRecord = {
  tool: string;
  mode: "read" | "dry-run" | "apply";
  files: string[];
  dryRunId?: string;
  at: string;
  error?: string;
};

/** Shown in the thread when a change edits too many pages outside the tools. */
export const HAND_EDIT_REFUSAL =
  "This change edited too many pages by hand. Use find_pages, read_page, edit_include, set_meta, retag, replace_text, or list_links. Prefer an include when the same block is on many pages.";

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

export function handEditRefusal(
  before: Map<string, Uint8Array>,
  after: Map<string, Uint8Array>,
  toolLog: readonly { mode: string; files: readonly string[] }[] | undefined,
  limit: number
): string | null {
  const hand = handEditedPages(before, after, toolLog ?? []);
  return hand.length > limit ? HAND_EDIT_REFUSAL : null;
}
