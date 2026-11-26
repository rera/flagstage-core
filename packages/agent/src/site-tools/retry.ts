import {
  HAND_EDIT_GUIDANCE,
  HAND_EDIT_RETRY_LIMIT,
  guardRecord,
  handEditedPages,
  type ToolCallRecord
} from "./guard";
import type { AgentRunner } from "../subprocess";

export type GuardedEdit = {
  /** False when every attempt, including the retry, still hand-edited too many pages. */
  accepted: boolean;
  changed: boolean;
  files: Map<string, Uint8Array>;
  reply?: string;
  toolLog: ToolCallRecord[];
};

/**
 * Run the editor. If it hand-edits too many pages, discard that result and
 * ask it once to redo the change with the site-edit tools. The files passed
 * to every attempt are the originals.
 */
export async function editWithinHandLimit(input: {
  runner: AgentRunner;
  files: Map<string, Uint8Array>;
  request: string;
  limit: number;
  accountSkills?: string;
}): Promise<GuardedEdit> {
  const toolLog: ToolCallRecord[] = [];
  let guidance: string | undefined;
  for (let attempt = 0; attempt <= HAND_EDIT_RETRY_LIMIT; attempt += 1) {
    const edited = await input.runner.edit(input.files, input.request, guidance, {
      accountSkills: input.accountSkills
    });
    toolLog.push(...(edited.toolLog ?? []));
    const hand = handEditedPages(input.files, edited.files, edited.toolLog ?? []);
    if (hand.length <= input.limit) {
      return {
        accepted: true,
        changed: edited.changed,
        files: edited.files,
        reply: edited.reply,
        toolLog
      };
    }
    toolLog.push(guardRecord("refuse", hand));
    if (attempt === HAND_EDIT_RETRY_LIMIT) {
      return {
        accepted: false,
        changed: false,
        files: input.files,
        reply: edited.reply,
        toolLog
      };
    }
    toolLog.push(guardRecord("retry", hand));
    guidance = HAND_EDIT_GUIDANCE;
  }
  return { accepted: false, changed: false, files: input.files, toolLog };
}
