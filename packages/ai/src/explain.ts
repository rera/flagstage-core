import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import type { ListingDecisionSettings } from "./decide";

/**
 * One plain sentence for a shared block the importer left on the page.
 * The decision model writes it. The technical note stays a separate field.
 */

export const EXPLANATION_MAX = 140;

const PLAIN_SECTIONS = [
  "footer",
  "header",
  "sidebar",
  "navigation",
  "newsletter",
  "banner",
  "cookie notice",
  "section"
] as const;

export type PlainSection = (typeof PLAIN_SECTIONS)[number];

export type BlockSituation = "close" | "varied";

export type BlockBrief = {
  id: string;
  section: PlainSection;
  situation: BlockSituation;
};

/**
 * Instructions for the one batched call. Item lines are appended by
 * `blockExplanationPrompt`. Nothing in either part is a selector or a path.
 */
export const BLOCK_EXPLANATION_PROMPT = `Write one plain sentence for each numbered item, for the person who owns the site.
Say what happened and that the block stayed on the page.
Use everyday words. Exactly one sentence, ending with a period.
Do not mention selectors, paths, file names, HTML, or code.
Reply with one JSON object and no markdown:
{"sentences":[{"id":"1","sentence":"..."}]}`;

const CODE_LIKE =
  /[`<>{}[\]\\/#=]|https?:|\b[\w-]+\.(?:html?|css|js|json|svg|png|jpe?g)\b|\w\.\w|_/;

const JARGON =
  /\b(inline|selector|normaliz\w*|markup|snippet|fingerprint)\b|exact match|current-page|_inc/i;

export function plainSectionName(hint: string): PlainSection {
  const leaf = hint.split("/").pop() ?? hint;
  const text = leaf.toLowerCase();
  if (text.includes("footer")) return "footer";
  if (text.includes("header") || text.includes("masthead")) return "header";
  if (text.includes("sidebar")) return "sidebar";
  if (text.includes("newsletter")) return "newsletter";
  if (text.includes("cookie")) return "cookie notice";
  if (text.includes("alert") || text.includes("banner")) return "banner";
  if (text.includes("nav")) return "navigation";
  return "section";
}

/** Section named by a shared-block debug note, or null when the note is something else. */
export function sectionFromBlockDetail(detail: string): PlainSection | null {
  const match = /^Left the (.+?) block inline\./.exec(detail);
  if (!match?.[1]) return null;
  return plainSectionName(match[1]);
}

export function blockSituation(detail: string): BlockSituation | null {
  if (!sectionFromBlockDetail(detail)) return null;
  if (detail.includes("close to") || detail.includes("not an exact match")) return "close";
  return "varied";
}

export function fallbackBlockExplanation(section: string): string {
  const name = (PLAIN_SECTIONS as readonly string[]).includes(section) ? section : "section";
  return `This page's ${name} is a little different from the shared one, so we kept it on the page.`;
}

export function isCustomerSentence(value: string): boolean {
  const text = value.trim();
  if (text.length < 24 || text.length > EXPLANATION_MAX) return false;
  if (!/^[^.!?\r\n]+[.]$/.test(text)) return false;
  if (CODE_LIKE.test(text) || JARGON.test(text)) return false;
  if (!/\bpage\b/i.test(text)) return false;
  return true;
}

export function blockExplanationPrompt(items: readonly BlockBrief[]): string {
  const lines = items.map((item) => `${item.id}. ${situationLine(item)}`);
  return `${BLOCK_EXPLANATION_PROMPT}\nItems:\n${lines.join("\n")}`;
}

function situationLine(item: BlockBrief): string {
  if (item.situation === "close") {
    return `The ${item.section} is close to the shared one, but not the same, so it stayed on the page.`;
  }
  return `Similar ${plural(item.section)} appear on most pages, and no one version is the same on most pages, so it stayed on the page.`;
}

function plural(section: PlainSection): string {
  if (section === "navigation") return "navigation blocks";
  if (section === "cookie notice") return "cookie notices";
  return `${section}s`;
}

/**
 * Reads the model's JSON. Invalid sentences are dropped so that item can
 * use the fallback. A reply that is not JSON throws.
 */
export function parseBlockExplanations(text: string): Map<string, string> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Explanation model did not return JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Explanation model returned invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Explanation model JSON must be an object.");
  }
  const sentences = (parsed as { sentences?: unknown }).sentences;
  if (!Array.isArray(sentences)) {
    throw new Error("Explanation model sentences must be a list.");
  }
  const out = new Map<string, string>();
  for (const entry of sentences) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as { id?: unknown; sentence?: unknown };
    if (typeof record.id !== "string" || typeof record.sentence !== "string") continue;
    const id = record.id.trim();
    const sentence = record.sentence.trim().replace(/\s+/g, " ");
    if (!id || !isCustomerSentence(sentence)) continue;
    out.set(id, sentence);
  }
  return out;
}

async function converse(region: string, modelId: string, prompt: string): Promise<string> {
  const client = new BedrockRuntimeClient({ region });
  const response = await client.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 800, temperature: 0 }
    })
  );
  const blocks = response.output?.message?.content ?? [];
  return blocks
    .map((block) => ("text" in block && typeof block.text === "string" ? block.text : ""))
    .join("");
}

/**
 * One Bedrock call for every flagged block. The model id comes from importer
 * settings. An empty map means the model was not asked or returned nothing
 * usable. A throw means the call failed.
 */
export function bedrockExplainBlocks(options: {
  region: string;
  settings: ListingDecisionSettings;
  send?: (region: string, modelId: string, prompt: string) => Promise<string>;
}): (items: readonly BlockBrief[]) => Promise<Map<string, string>> {
  const send = options.send ?? converse;
  return async (items) => {
    if (items.length === 0) return new Map();
    const { decisionEnabled, decisionModel } = options.settings;
    if (!decisionEnabled) return new Map();
    if (decisionModel.provider !== "bedrock") return new Map();
    if (!options.region || !decisionModel.modelId) return new Map();
    return parseBlockExplanations(
      await send(options.region, decisionModel.modelId, blockExplanationPrompt(items))
    );
  };
}
