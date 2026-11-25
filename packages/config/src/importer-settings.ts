import { z } from "zod";

/**
 * Platform importer settings. One database row, not an environment variable.
 *
 * `decisionModel.provider` stays a single literal so a later provider (another
 * decision model) is a new branch on this object. Fallback page size and the
 * newest-first redirect policy are further fields on the same record.
 *
 * Claude Haiku 4.5 on Bedrock is called through the Converse API
 * (`bedrock-runtime`). That endpoint does not accept the bare model id. It
 * requires a geo or global inference profile. The global profile is the
 * default because it can be invoked from any source region.
 */
export const DEFAULT_DECISION_MODEL_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

/** Matches the threshold the importer used before this setting existed. */
export const DEFAULT_DECISION_CONFIDENCE_THRESHOLD = 0.6;

/** Default page cap for an import. A platform setting, not an environment variable. */
export const DEFAULT_IMPORT_MAX_PAGES = 5_000;

/** Default asset cap for an import. A platform setting, not an environment variable. */
export const DEFAULT_IMPORT_MAX_ASSETS = 20_000;

export const decisionModelSchema = z
  .object({
    provider: z.literal("bedrock"),
    modelId: z.string().trim().min(1).max(256)
  })
  .strict();

export const importerSettingsSchema = z
  .object({
    decisionModel: decisionModelSchema,
    decisionEnabled: z.boolean(),
    decisionConfidenceThreshold: z.number().min(0).max(1),
    maxPages: z.number().int().positive().max(1_000_000),
    maxAssets: z.number().int().positive().max(10_000_000),
    disabledImporters: z.array(z.string().trim().min(1).max(64)).max(64)
  })
  .strict();

export const importerSettingsPatchSchema = importerSettingsSchema
  .partial()
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Change at least one importer setting."
  });

export type DecisionModel = z.infer<typeof decisionModelSchema>;
export type ImporterSettings = z.infer<typeof importerSettingsSchema>;
export type ImporterSettingsPatch = z.infer<typeof importerSettingsPatchSchema>;

export function defaultImporterSettings(): ImporterSettings {
  return {
    decisionModel: { provider: "bedrock", modelId: DEFAULT_DECISION_MODEL_ID },
    decisionEnabled: true,
    decisionConfidenceThreshold: DEFAULT_DECISION_CONFIDENCE_THRESHOLD,
    maxPages: DEFAULT_IMPORT_MAX_PAGES,
    maxAssets: DEFAULT_IMPORT_MAX_ASSETS,
    disabledImporters: []
  };
}

export function formatImporterSettingsIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "settings";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}
