import { PUBLIC_SITE_SOURCE, publicSiteImporter } from "./crawl";
import type { Importer } from "./interface";

const importers = new Map<string, Importer>();

export function registerImporter(importer: Importer): void {
  const name = importer.name.trim();
  if (!name) throw new Error("An importer needs a name.");
  importers.set(name, importer);
}

export function getImporter(name: string): Importer {
  const found = importers.get(name);
  if (!found) throw new Error(`No importer is registered as "${name}".`);
  return found;
}

export function listImporters(): string[] {
  return [...importers.keys()].sort();
}

export { PUBLIC_SITE_SOURCE };

registerImporter(publicSiteImporter);
