import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { frameUntrusted } from "./intent";

/**
 * One listing decision. The importer calls this only when its own measurements
 * disagree, then checks the reply against those measurements.
 */
export interface ListingSummary {
  candidateSelectors: { selector: string; count: number }[];
  pageSizes: number[];
  urlSamples: string[];
  sampleItemHtml: string;
}

export interface ListingDecision {
  pageSize: number;
  itemSelector: string;
  urlPattern: string;
  order: "newest-first" | "oldest-first";
  group: "all" | "section" | "tag";
  confidence: number;
  reason: string;
}

/**
 * Swappable model. One function, no SDK types in the caller.
 * `null` means the model was not asked and the measured guess stands.
 */
export type ListingDecide = (summary: ListingSummary) => Promise<ListingDecision | null>;

/** Model id and on/off switch from platform importer settings. */
export interface ListingDecisionSettings {
  decisionEnabled: boolean;
  decisionModel: { provider: string; modelId: string };
}

const PROMPT = `Choose the listing pagination. Reply with one JSON object and no markdown.
Fields:
- pageSize: number, one of the page sizes seen
- itemSelector: string, one of the candidate selectors
- urlPattern: string, {n} is the page number, such as /news/page/{n}/ or ?page={n}
- order: "newest-first" or "oldest-first"
- group: "all", "section", or "tag"
- confidence: number from 0 to 1
- reason: one short sentence
`;

export function parseListingDecision(text: string): ListingDecision {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Listing model did not return JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Listing model returned invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Listing model JSON must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  const pageSize = record.pageSize;
  const itemSelector = record.itemSelector;
  const urlPattern = record.urlPattern;
  const order = record.order;
  const group = record.group;
  const rawConfidence = record.confidence;
  const reason = record.reason;
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Listing model pageSize must be a positive integer.");
  }
  if (typeof itemSelector !== "string" || itemSelector.trim() === "") {
    throw new Error("Listing model itemSelector must be a string.");
  }
  if (typeof urlPattern !== "string" || !urlPattern.includes("{n}")) {
    throw new Error("Listing model urlPattern must include {n}.");
  }
  if (order !== "newest-first" && order !== "oldest-first") {
    throw new Error("Listing model order is not newest-first or oldest-first.");
  }
  if (group !== "all" && group !== "section" && group !== "tag") {
    throw new Error("Listing model group is not all, section, or tag.");
  }
  if (typeof rawConfidence !== "number" || !Number.isFinite(rawConfidence)) {
    throw new Error("Listing model confidence must be a number.");
  }
  const confidence =
    rawConfidence > 1 && rawConfidence <= 100 ? rawConfidence / 100 : rawConfidence;
  if (confidence < 0 || confidence > 1)
    throw new Error("Listing model confidence is out of range.");
  if (typeof reason !== "string") throw new Error("Listing model reason must be a string.");
  return {
    pageSize,
    itemSelector: itemSelector.trim(),
    urlPattern: urlPattern.trim(),
    order,
    group,
    confidence,
    reason: reason.trim().slice(0, 240)
  };
}

function promptFor(summary: ListingSummary): string {
  const compact: ListingSummary = {
    ...summary,
    sampleItemHtml: summary.sampleItemHtml.slice(0, 500)
  };
  return `${PROMPT}\n${frameUntrusted(JSON.stringify(compact), "listing measurements")}`;
}

async function converse(region: string, modelId: string, prompt: string): Promise<string> {
  const client = new BedrockRuntimeClient({ region });
  const response = await client.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 400, temperature: 0 }
    })
  );
  const blocks = response.output?.message?.content ?? [];
  return blocks
    .map((block) => ("text" in block && typeof block.text === "string" ? block.text : ""))
    .join("");
}

/**
 * Claude Haiku on Bedrock. The model id comes from importer settings.
 * Pass `send` in tests. A turned-off model returns null so the importer
 * keeps the measured guess. A throw means the model was unavailable.
 */
export function bedrockListingDecide(options: {
  region: string;
  settings: ListingDecisionSettings;
  send?: (region: string, modelId: string, prompt: string) => Promise<string>;
}): ListingDecide {
  const region = options.region;
  const { decisionEnabled, decisionModel } = options.settings;
  const send = options.send ?? converse;
  return async (summary) => {
    if (!decisionEnabled) return null;
    if (decisionModel.provider !== "bedrock") {
      throw new Error("Listing decision provider is not bedrock.");
    }
    if (!region || !decisionModel.modelId) {
      throw new Error("Listing model region and model id are required.");
    }
    return parseListingDecision(await send(region, decisionModel.modelId, promptFor(summary)));
  };
}
