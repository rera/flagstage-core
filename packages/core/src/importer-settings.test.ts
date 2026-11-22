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
  const sqlText = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle/0005_importer_settings.sql"),
    "utf8"
  );
  await client.exec(sqlText);
  const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
  return { db, client };
}

describe("importer settings", () => {
  it("returns the Haiku 4.5 defaults when the row is missing", async () => {
    const { db, client } = await database();
    try {
      const settings = await getImporterSettings(db);
      expect(DEFAULT_DECISION_MODEL_ID).toBe("global.anthropic.claude-haiku-4-5-20251001-v1:0");
      expect(settings).toEqual({
        decisionModel: { provider: "bedrock", modelId: DEFAULT_DECISION_MODEL_ID },
        decisionEnabled: true,
        decisionConfidenceThreshold: 0.6
      });
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
        decisionConfidenceThreshold: 0.25
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

      expect(await getImporterSettings(db)).toEqual({
        decisionModel: { provider: "bedrock", modelId: DEFAULT_DECISION_MODEL_ID },
        decisionEnabled: true,
        decisionConfidenceThreshold: 0.6
      });
    } finally {
      await client.close();
    }
  });
});
