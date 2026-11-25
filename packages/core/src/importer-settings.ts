import {
  defaultImporterSettings,
  formatImporterSettingsIssues,
  importerSettingsPatchSchema,
  importerSettingsSchema,
  type ImporterSettings,
  type ImporterSettingsPatch
} from "@flagstage/config";
import { importerSettings, type Database } from "@flagstage/db";
import { eq } from "drizzle-orm";

import { can, type Principal } from "./policy";

/** Singleton row. Absent means the typed defaults. */
export const IMPORTER_SETTINGS_ID = "platform";

export class ImporterSettingsError extends Error {
  readonly code: "forbidden" | "invalid";

  constructor(code: "forbidden" | "invalid", message: string) {
    super(message);
    this.name = "ImporterSettingsError";
    this.code = code;
  }
}

/**
 * The importer's knobs. A missing row returns the defaults: decision calls on,
 * Claude Haiku 4.5 on Bedrock, confidence threshold 0.6, 5,000 pages, and
 * 20,000 assets.
 */
export async function getImporterSettings(db: Database): Promise<ImporterSettings> {
  const rows = await db
    .select()
    .from(importerSettings)
    .where(eq(importerSettings.id, IMPORTER_SETTINGS_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return defaultImporterSettings();
  const parsed = importerSettingsSchema.safeParse({
    decisionModel: row.decisionModel,
    decisionEnabled: row.decisionEnabled,
    decisionConfidenceThreshold: row.decisionConfidenceThreshold,
    maxPages: row.maxPages,
    maxAssets: row.maxAssets,
    disabledImporters: row.disabledImporters ?? []
  });
  if (!parsed.success) {
    throw new ImporterSettingsError(
      "invalid",
      `Invalid importer settings:\n${formatImporterSettingsIssues(parsed.error)}`
    );
  }
  return parsed.data;
}

/**
 * Replace the platform importer settings. Platform admins only (`org.manage`).
 * The patch is validated and merged onto the current row. The admin importer
 * page calls this.
 */
export async function updateImporterSettings(
  db: Database,
  actor: Principal,
  patch: ImporterSettingsPatch
): Promise<ImporterSettings> {
  if (!can(actor, "org.manage")) {
    throw new ImporterSettingsError(
      "forbidden",
      "Only a platform admin can change importer settings."
    );
  }
  const parsed = importerSettingsPatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new ImporterSettingsError(
      "invalid",
      `Invalid importer settings:\n${formatImporterSettingsIssues(parsed.error)}`
    );
  }
  const current = await getImporterSettings(db);
  const next = importerSettingsSchema.parse({
    decisionModel: parsed.data.decisionModel ?? current.decisionModel,
    decisionEnabled: parsed.data.decisionEnabled ?? current.decisionEnabled,
    decisionConfidenceThreshold:
      parsed.data.decisionConfidenceThreshold ?? current.decisionConfidenceThreshold,
    maxPages: parsed.data.maxPages ?? current.maxPages,
    maxAssets: parsed.data.maxAssets ?? current.maxAssets,
    disabledImporters: parsed.data.disabledImporters ?? current.disabledImporters
  });
  const now = new Date();
  await db
    .insert(importerSettings)
    .values({
      id: IMPORTER_SETTINGS_ID,
      decisionModel: next.decisionModel,
      decisionEnabled: next.decisionEnabled,
      decisionConfidenceThreshold: next.decisionConfidenceThreshold,
      maxPages: next.maxPages,
      maxAssets: next.maxAssets,
      disabledImporters: next.disabledImporters,
      updatedAt: now,
      updatedBy: actor.id
    })
    .onConflictDoUpdate({
      target: importerSettings.id,
      set: {
        decisionModel: next.decisionModel,
        decisionEnabled: next.decisionEnabled,
        decisionConfidenceThreshold: next.decisionConfidenceThreshold,
        maxPages: next.maxPages,
        maxAssets: next.maxAssets,
        disabledImporters: next.disabledImporters,
        updatedAt: now,
        updatedBy: actor.id
      }
    });
  return next;
}
