import { getImporter, listImporters } from "@flagstage/importer";

export type InstalledImporter = {
  id: string;
  name: string;
  detects: string;
};

const detects: Record<string, string> = {
  public: "Public websites",
  wordpress: "WordPress sites"
};

/**
 * Importers registered in this process. Names come from the registry.
 * WordPress is included when `wordpressImporter` is registered.
 */
export function installedImporters(): InstalledImporter[] {
  return listImporters().map((id) => {
    const importer = getImporter(id);
    return {
      id: importer.id,
      name: importer.label,
      detects: detects[importer.id] ?? importer.label
    };
  });
}
