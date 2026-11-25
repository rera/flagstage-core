"use server";

import {
  detectImporter,
  getImporter,
  listImporters,
  type ImporterChoice
} from "@flagstage/importer";

import { requirePrincipal } from "./guard";

export async function detectImporterAction(url: string): Promise<ImporterChoice> {
  await requirePrincipal();
  return detectImporter(url);
}

export async function listImporterChoicesAction(): Promise<Array<{ id: string; label: string }>> {
  await requirePrincipal();
  return listImporters().map((id) => {
    const importer = getImporter(id);
    return { id: importer.id, label: importer.label };
  });
}
