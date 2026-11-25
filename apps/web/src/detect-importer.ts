"use server";

import { detectImporter, type ImporterChoice } from "@flagstage/importer";

import { requirePrincipal } from "./guard";

export async function detectImporterAction(url: string): Promise<ImporterChoice> {
  await requirePrincipal();
  return detectImporter(url);
}
