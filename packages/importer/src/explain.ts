import {
  bedrockExplainBlocks,
  blockSituation,
  fallbackBlockExplanation,
  isCustomerSentence,
  sectionFromBlockDetail,
  type BlockBrief,
  type BlockSituation,
  type PlainSection
} from "@flagstage/ai";
import type { ImporterSettings } from "@flagstage/config";

import type { FidelityItem, ImportResult } from "./types";

/**
 * Writes one customer sentence onto each shared block the importer left on
 * the page. The technical `detail` is unchanged. One model call covers every
 * distinct block. A miss, a turned-off model, or a rejected sentence uses the
 * fixed fallback.
 */
export async function explainUncertainBlocks(
  result: ImportResult,
  options: {
    region: string;
    settings: Pick<ImporterSettings, "decisionEnabled" | "decisionModel">;
    send?: (region: string, modelId: string, prompt: string) => Promise<string>;
  }
): Promise<ImportResult> {
  const groups = new Map<string, Omit<BlockBrief, "id">>();
  for (const item of result.report.uncertain) {
    const brief = briefFor(item);
    if (!brief) continue;
    const key = `${brief.section}\0${brief.situation}`;
    if (!groups.has(key)) groups.set(key, brief);
  }
  if (groups.size === 0) return result;

  const ordered = [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  const briefs: BlockBrief[] = ordered.map(([, brief], index) => ({
    ...brief,
    id: String(index + 1)
  }));
  const byKey = new Map(briefs.map((brief) => [`${brief.section}\0${brief.situation}`, brief]));

  let written = new Map<string, string>();
  try {
    written = await bedrockExplainBlocks({
      region: options.region,
      settings: options.settings,
      send: options.send
    })(briefs);
  } catch {
    written = new Map();
  }

  const uncertain = result.report.uncertain.map((item) => {
    const section = sectionFromBlockDetail(item.detail);
    const situation = blockSituation(item.detail);
    if (!section || !situation) return item;
    const brief = byKey.get(`${section}\0${situation}`);
    const sentence = brief ? written.get(brief.id) : undefined;
    return {
      ...item,
      explanation:
        sentence && isCustomerSentence(sentence) ? sentence : fallbackBlockExplanation(section)
    };
  });
  return { ...result, report: { ...result.report, uncertain } };
}

function briefFor(item: FidelityItem): Omit<BlockBrief, "id"> | null {
  const section: PlainSection | null = sectionFromBlockDetail(item.detail);
  const situation: BlockSituation | null = blockSituation(item.detail);
  if (!section || !situation) return null;
  return { section, situation };
}
