import { defaultFetch } from "./fetch-page";
import type { Importer, ImporterChoice, ImporterMatch } from "./interface";
import { PUBLIC_IMPORTER_ID, publicImporter } from "./importers/public";
import { wordpressImporter } from "./importers/wordpress";
import type { PageFetch } from "./types";

const importers = new Map<string, Importer>();

export function registerImporter(importer: Importer): void {
  const id = importer.id.trim();
  if (!id) throw new Error("An importer needs an id.");
  if (!importer.label.trim()) throw new Error("An importer needs a label.");
  importers.set(id, importer);
}

export function getImporter(id: string): Importer {
  const found = importers.get(id);
  if (!found) throw new Error(`No importer is registered as "${id}".`);
  return found;
}

export function listImporters(): string[] {
  return [...importers.keys()].sort();
}

function importUrl(value: string): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("The import URL must be an http or https URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The import URL must be an http or https URL.");
  }
  return trimmed;
}

export async function detectImporter(
  url: string,
  fetchPage: PageFetch = defaultFetch
): Promise<ImporterChoice> {
  const target = importUrl(url);
  const candidates = [...importers.values()].filter(
    (importer) => importer.id !== PUBLIC_IMPORTER_ID
  );
  const detected = await Promise.all(
    candidates.map(async (importer) => {
      try {
        const match = await importer.detect(target, fetchPage);
        return { importer, match };
      } catch {
        return { importer, match: null as ImporterMatch | null };
      }
    })
  );
  const matches = detected.filter(
    (entry): entry is { importer: Importer; match: ImporterMatch } => entry.match?.match === true
  );
  matches.sort((left, right) => {
    if (right.match.confidence !== left.match.confidence) {
      return right.match.confidence - left.match.confidence;
    }
    return left.importer.id.localeCompare(right.importer.id);
  });
  const best = matches[0];
  if (best) {
    return {
      id: best.importer.id,
      label: best.importer.label,
      confidence: best.match.confidence,
      evidence: best.match.evidence
    };
  }
  const fallback = getImporter(PUBLIC_IMPORTER_ID);
  return {
    id: fallback.id,
    label: fallback.label,
    confidence: 0,
    evidence: "No importer recognized this site."
  };
}

export { PUBLIC_IMPORTER_ID };

registerImporter(publicImporter);
registerImporter(wordpressImporter);
