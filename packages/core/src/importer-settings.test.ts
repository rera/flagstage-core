import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { DEFAULT_DECISION_MODEL_ID } from "@flagstage/config";
import type { Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";

import {
  getImporterSettings,
  ImporterSettingsError,
  updateImporterSettings
} from "./importer-settings";
import type { Principal } from "./policy";

const admin: Principal = { id: "admin-1", orgRole: "admin", memberships: [] };
const accountAdmin: Principal = {
  id: "acct-1",
  orgRole: "none",
  memberships: [{ accountId: "acct", role: "account_admin" }]
};

async function database() {
  const client = new PGlite();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of ["0005_importer_settings.sql", "0008_import_caps.sql"]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
  const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
  return { db, client };
}

const defaults = {
  decisionModel: { provider: "bedrock" as const, modelId: DEFAULT_DECISION_MODEL_ID },
  decisionEnabled: true,
  decisionConfidenceThreshold: 0.6,
  maxPages: 5000,
  maxAssets: 20000,
  disabledImporters: [] as string[]
};

describe("importer settings", () => {
  it("returns the Haiku 4.5 defaults when the row is missing", async () => {
    const { db, client } = await database();
    try {
      const settings = await getImporterSettings(db);
      expect(DEFAULT_DECISION_MODEL_ID).toBe("global.anthropic.claude-haiku-4-5-20251001-v1:0");
      expect(settings).toEqual(defaults);
    } finally {
      await client.close();
    }
  });

  it("updates the row and reads it back", async () => {
    const { db, client } = await database();
    try {
      const saved = await updateImporterSettings(db, admin, {
        decisionModel: { provider: "bedrock", modelId: "anthropic.claude-haiku-4-5-test" },
        decisionEnabled: false,
        decisionConfidenceThreshold: 0.25
      });
      expect(saved.decisionModel.modelId).toBe("anthropic.claude-haiku-4-5-test");
      expect(await getImporterSettings(db)).toEqual(saved);

      const merged = await updateImporterSettings(db, admin, { decisionEnabled: true });
      expect(merged).toEqual({
        decisionModel: { provider: "bedrock", modelId: "anthropic.claude-haiku-4-5-test" },
        decisionEnabled: true,
        decisionConfidenceThreshold: 0.25,
        maxPages: 5000,
        maxAssets: 20000,
        disabledImporters: []
      });
      expect(await getImporterSettings(db)).toEqual(merged);
    } finally {
      await client.close();
    }
  });

  it("refuses an account admin and an invalid patch", async () => {
    const { db, client } = await database();
    try {
      await expect(
        updateImporterSettings(db, accountAdmin, { decisionEnabled: false })
      ).rejects.toBeInstanceOf(ImporterSettingsError);
      await expect(
        updateImporterSettings(db, { ...admin, disabled: true }, { decisionEnabled: false })
      ).rejects.toThrow(/platform admin/);

      await expect(
        updateImporterSettings(db, admin, { decisionConfidenceThreshold: 2 })
      ).rejects.toThrow(/decisionConfidenceThreshold/);
      await expect(
        updateImporterSettings(db, admin, {
          decisionModel: { provider: "bedrock", modelId: "  " }
        })
      ).rejects.toThrow(/modelId/);

      expect(await getImporterSettings(db)).toEqual(defaults);
    } finally {
      await client.close();
    }
  });

  it("stores page and asset caps, and which importers are off", async () => {
    const { db, client } = await database();
    try {
      const saved = await updateImporterSettings(db, admin, { maxPages: 12, maxAssets: 34 });
      expect(saved.maxPages).toBe(12);
      expect(saved.maxAssets).toBe(34);
      expect(await getImporterSettings(db)).toEqual(saved);

      const off = await updateImporterSettings(db, admin, { disabledImporters: ["public-site"] });
      expect(off.disabledImporters).toEqual(["public-site"]);
      expect(off.maxPages).toBe(12);
      const on = await updateImporterSettings(db, admin, { disabledImporters: [] });
      expect(on.disabledImporters).toEqual([]);
      expect(await getImporterSettings(db)).toEqual(on);

      await expect(updateImporterSettings(db, admin, { maxPages: 0 })).rejects.toThrow(/maxPages/);
      await expect(updateImporterSettings(db, admin, { maxAssets: 1.5 })).rejects.toThrow(
        /maxAssets/
      );
      expect((await getImporterSettings(db)).maxPages).toBe(12);
    } finally {
      await client.close();
    }
  });
});
