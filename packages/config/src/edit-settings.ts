import { z } from "zod";

/**
 * How many page files one change may edit by hand, outside the site-edit tools.
 * One database row, not an environment variable. The admin editor page calls
 * the core accessor rather than reading this row itself.
 */
export const DEFAULT_HAND_EDIT_PAGE_LIMIT = 8;

export const editSettingsSchema = z
  .object({
    handEditPageLimit: z.number().int().min(0).max(10_000)
  })
  .strict();

export const editSettingsPatchSchema = editSettingsSchema
  .partial()
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Change at least one edit setting."
  });

export type EditSettings = z.infer<typeof editSettingsSchema>;
export type EditSettingsPatch = z.infer<typeof editSettingsPatchSchema>;

export function defaultEditSettings(): EditSettings {
  return { handEditPageLimit: DEFAULT_HAND_EDIT_PAGE_LIMIT };
}

export function formatEditSettingsIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "settings";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}
