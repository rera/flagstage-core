import {
  defaultEditSettings,
  editSettingsPatchSchema,
  editSettingsSchema,
  formatEditSettingsIssues,
  type EditSettings,
  type EditSettingsPatch
} from "@flagstage/config";
import { editSettings, type Database } from "@flagstage/db";
import { eq } from "drizzle-orm";

import { can, type Principal } from "./policy";

/** Singleton row. Absent means the typed default. */
export const EDIT_SETTINGS_ID = "platform";

export class EditSettingsError extends Error {
  readonly code: "forbidden" | "invalid";

  constructor(code: "forbidden" | "invalid", message: string) {
    super(message);
    this.name = "EditSettingsError";
    this.code = code;
  }
}

/**
 * How many page files one change may edit by hand. A missing row returns 8.
 * Pages written by the site-edit tools do not count. This is not read from
 * the environment.
 */
export async function getEditSettings(db: Database): Promise<EditSettings> {
  const rows = await db
    .select()
    .from(editSettings)
    .where(eq(editSettings.id, EDIT_SETTINGS_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return defaultEditSettings();
  const parsed = editSettingsSchema.safeParse({ handEditPageLimit: row.handEditPageLimit });
  if (!parsed.success) {
    throw new EditSettingsError(
      "invalid",
      `Invalid edit settings:\n${formatEditSettingsIssues(parsed.error)}`
    );
  }
  return parsed.data;
}

/**
 * Replace the platform edit settings. Platform admins only (`org.manage`).
 * The admin page is not built yet. It should call this rather than writing
 * the row through another path.
 */
export async function updateEditSettings(
  db: Database,
  actor: Principal,
  patch: EditSettingsPatch
): Promise<EditSettings> {
  if (!can(actor, "org.manage")) {
    throw new EditSettingsError("forbidden", "Only a platform admin can change edit settings.");
  }
  const parsed = editSettingsPatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new EditSettingsError(
      "invalid",
      `Invalid edit settings:\n${formatEditSettingsIssues(parsed.error)}`
    );
  }
  const current = await getEditSettings(db);
  const next = editSettingsSchema.parse({
    handEditPageLimit: parsed.data.handEditPageLimit ?? current.handEditPageLimit
  });
  const now = new Date();
  await db
    .insert(editSettings)
    .values({
      id: EDIT_SETTINGS_ID,
      handEditPageLimit: next.handEditPageLimit,
      updatedAt: now,
      updatedBy: actor.id
    })
    .onConflictDoUpdate({
      target: editSettings.id,
      set: {
        handEditPageLimit: next.handEditPageLimit,
        updatedAt: now,
        updatedBy: actor.id
      }
    });
  return next;
}
