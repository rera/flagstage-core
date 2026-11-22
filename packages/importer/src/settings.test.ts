import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { bedrockListingDecide, type ListingSummary } from "@flagstage/ai";
import { getImporterSettings, updateImporterSettings, type Principal } from "@flagstage/core";
import type { Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";

const admin: Principal = { id: "admin-1", orgRole: "admin", memberships: [] };

const SUMMARY: ListingSummary = {
  candidateSelectors: [{ selector: "li.post", count: 10 }],
  pageSizes: [8, 10, 12],
  urlSamples: ["/news/page/2/"],
  sampleItemHtml: '<li class="post">Story</li>'
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

describe("stored importer decision model", () => {
  it("asks the model id stored on the platform row", async () => {
    const { db, client } = await database();
    try {
      await updateImporterSettings(db, admin, {
        decisionModel: { provider: "bedrock", modelId: "anthropic.claude-haiku-4-5-stored" }
      });
      const settings = await getImporterSettings(db);
      let seen = "";
      const decide = bedrockListingDecide({
        region: "us-east-1",
        settings,
        send: async (region, modelId) => {
          seen = `${region} ${modelId}`;
          return JSON.stringify({
            pageSize: 10,
            itemSelector: "li.post",
            urlPattern: "/news/page/{n}/",
            order: "newest-first",
            group: "all",
            confidence: 0.8,
            reason: "stored"
          });
        }
      });
      const decision = await decide(SUMMARY);
      expect(decision?.pageSize).toBe(10);
      expect(seen).toBe("us-east-1 anthropic.claude-haiku-4-5-stored");
    } finally {
      await client.close();
    }
  });

  it("does not call the model when the stored switch is off", async () => {
    const { db, client } = await database();
    try {
      await updateImporterSettings(db, admin, { decisionEnabled: false });
      const settings = await getImporterSettings(db);
      let called = false;
      const decide = bedrockListingDecide({
        region: "us-east-1",
        settings,
        send: async () => {
          called = true;
          return "{}";
        }
      });
      await expect(decide(SUMMARY)).resolves.toBeNull();
      expect(called).toBe(false);
    } finally {
      await client.close();
    }
  });
});
