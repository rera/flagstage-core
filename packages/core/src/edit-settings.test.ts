import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { DEFAULT_HAND_EDIT_PAGE_LIMIT } from "@flagstage/config";
import type { Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";

import { EditSettingsError, getEditSettings, updateEditSettings } from "./edit-settings";
import type { Principal } from "./policy";

const admin: Principal = { id: "admin-1", orgRole: "admin", memberships: [] };
const accountAdmin: Principal = {
  id: "acct-1",
  orgRole: "none",
  memberships: [{ accountId: "acct", role: "account_admin" }]
};

async function database() {
  const client = new PGlite();
  const sqlText = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle/0006_edit_settings.sql"),
    "utf8"
  );
  const create = sqlText.split("--> statement-breakpoint")[0] ?? sqlText;
  await client.exec(create);
  const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
  return { db, client };
}

describe("edit settings", () => {
  it("returns the default hand-edit limit when the row is missing", async () => {
    const { db, client } = await database();
    try {
      expect(DEFAULT_HAND_EDIT_PAGE_LIMIT).toBe(8);
      expect(await getEditSettings(db)).toEqual({ handEditPageLimit: 8 });
    } finally {
      await client.close();
    }
  });

  it("updates the row and reads it back", async () => {
    const { db, client } = await database();
    try {
      const saved = await updateEditSettings(db, admin, { handEditPageLimit: 3 });
      expect(saved).toEqual({ handEditPageLimit: 3 });
      expect(await getEditSettings(db)).toEqual(saved);
      const again = await updateEditSettings(db, admin, { handEditPageLimit: 0 });
      expect(again.handEditPageLimit).toBe(0);
      expect(await getEditSettings(db)).toEqual(again);
    } finally {
      await client.close();
    }
  });

  it("refuses an account admin and an invalid patch", async () => {
    const { db, client } = await database();
    try {
      await expect(
        updateEditSettings(db, accountAdmin, { handEditPageLimit: 1 })
      ).rejects.toBeInstanceOf(EditSettingsError);
      await expect(
        updateEditSettings(db, { ...admin, disabled: true }, { handEditPageLimit: 1 })
      ).rejects.toThrow(/platform admin/);
      await expect(updateEditSettings(db, admin, { handEditPageLimit: -1 })).rejects.toThrow(
        /handEditPageLimit/
      );
      await expect(updateEditSettings(db, admin, { handEditPageLimit: 1.5 })).rejects.toThrow(
        /handEditPageLimit/
      );
      await expect(updateEditSettings(db, admin, {})).rejects.toThrow(/at least one/i);
      expect(await getEditSettings(db)).toEqual({ handEditPageLimit: 8 });
    } finally {
      await client.close();
    }
  });
});
