import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { updateEditSettings, type Principal } from "@flagstage/core";
import {
  account,
  changeRequest,
  message,
  site,
  snapshot,
  user,
  type Database
} from "@flagstage/db";
import * as fullSchema from "@flagstage/db";
import { snapshotPrefix, type BlobStore, type StoredObject } from "@flagstage/storage";

import { postMessage } from "./turn";
import { HAND_EDIT_REFUSAL } from "./site-tools/guard";
import type { ToolCallRecord } from "./site-tools/run";
import type { AgentRunner } from "./subprocess";

const admin: Principal = { id: "user-1", orgRole: "admin", memberships: [] };

function memoryStore(): BlobStore & { files: Map<string, StoredObject> } {
  const files = new Map<string, StoredObject>();
  return {
    files,
    async put(key, body, contentType) {
      files.set(key, { body, contentType: contentType ?? "application/octet-stream" });
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async list(prefix) {
      return [...files.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, size: files.get(key)?.body.byteLength ?? 0 }));
    },
    async delete(key) {
      files.delete(key);
    },
    async copy(from, to) {
      const object = files.get(from);
      if (!object) throw new Error(`Missing ${from}`);
      files.set(to, { body: new Uint8Array(object.body), contentType: object.contentType });
    }
  };
}

function editing(paths: string[], log?: ToolCallRecord[]): AgentRunner {
  return {
    name: "subprocess",
    async edit(files) {
      const next = new Map(files);
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      for (const path of paths) {
        const current = decoder.decode(next.get(path) ?? new Uint8Array());
        next.set(path, encoder.encode(`${current}\n<!-- edited -->`));
      }
      return { changed: true, files: next, toolLog: log };
    }
  };
}

async function applyMigrations(client: PGlite) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of [
    "0000_init.sql",
    "0001_auth_plugins.sql",
    "0003_builder.sql",
    "0004_schedule.sql",
    "0006_edit_settings.sql"
  ]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
}

async function ready() {
  const client = new PGlite();
  await applyMigrations(client);
  const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
  const store = memoryStore();
  const now = new Date();
  await db.insert(user).values({
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    createdAt: now,
    updatedAt: now
  });
  await db.insert(account).values({ id: "acct-1", name: "Digital", slug: "digital" });
  await db.insert(site).values({
    id: "site-1",
    accountId: "acct-1",
    name: "Fixture",
    slug: "fixture",
    status: "live"
  });
  const liveId = "snap-live";
  await db.insert(snapshot).values({
    id: liveId,
    siteId: "site-1",
    kind: "import",
    storagePrefix: snapshotPrefix("site-1", liveId),
    fileCount: 1,
    bytes: 32
  });
  await db.update(site).set({ currentSnapshotId: liveId }).where(eq(site.id, "site-1"));
  const encoder = new TextEncoder();
  for (let index = 0; index < 20; index += 1) {
    await store.put(
      `${snapshotPrefix("site-1", liveId)}p/${index}.html`,
      encoder.encode(`<p>${index}</p>`),
      "text/html"
    );
  }
  for (let index = 0; index < 12; index += 1) {
    await store.put(
      `${snapshotPrefix("site-1", liveId)}_inc/${index}.html`,
      encoder.encode(`<p>inc ${index}</p>`),
      "text/html"
    );
  }
  return { db, client, store };
}

async function draftId(db: Database): Promise<string | null> {
  const rows = await db.select().from(site).where(eq(site.id, "site-1")).limit(1);
  return rows[0]?.draftSnapshotId ?? null;
}

describe("hand-edit guard", () => {
  it("refuses a sweep done outside the tools and allows the limit", async () => {
    const { db, client, store } = await ready();
    try {
      const refused = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Sweep nine pages",
        appOrigin: "http://localhost:3000",
        runner: editing(Array.from({ length: 9 }, (_, index) => `p/${index}.html`))
      });
      expect(refused.reply).toBe(HAND_EDIT_REFUSAL);
      expect(await draftId(db)).toBeNull();
      expect(await db.select().from(changeRequest)).toHaveLength(0);

      const allowed = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Touch eight pages",
        appOrigin: "http://localhost:3000",
        runner: editing(Array.from({ length: 8 }, (_, index) => `p/${index}.html`))
      });
      expect(allowed.reply).toBe("Preview updated");
      const draft = await draftId(db);
      expect(draft).toBeTruthy();
      const requests = await db.select().from(changeRequest);
      expect(requests[0]?.toolLog).toEqual([]);

      await updateEditSettings(db, admin, { handEditPageLimit: 2 });
      const tighter = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Touch three pages",
        appOrigin: "http://localhost:3000",
        runner: editing(["p/0.html", "p/1.html", "p/2.html"])
      });
      expect(tighter.reply).toBe(HAND_EDIT_REFUSAL);
      expect(await draftId(db)).toBe(draft);
      const notes = await db.select().from(message);
      expect(notes.filter((item) => item.body === HAND_EDIT_REFUSAL)).toHaveLength(2);
    } finally {
      await client.close();
    }
  });

  it("does not count includes, and tool-written pages do not count as hand-edits", async () => {
    const { db, client, store } = await ready();
    try {
      await updateEditSettings(db, admin, { handEditPageLimit: 2 });
      const includes = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Edit the includes",
        appOrigin: "http://localhost:3000",
        runner: editing(Array.from({ length: 12 }, (_, index) => `_inc/${index}.html`))
      });
      expect(includes.reply).toBe("Preview updated");

      const paths = Array.from({ length: 20 }, (_, index) => `p/${index}.html`);
      const log: ToolCallRecord[] = [
        {
          tool: "replace_text",
          mode: "apply",
          files: paths,
          dryRunId: "abc",
          at: "2026-11-22T00:00:00.000Z"
        }
      ];
      const swept = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Sweep with the tool",
        appOrigin: "http://localhost:3000",
        runner: editing(paths, log)
      });
      expect(swept.reply).toBe("Preview updated");
      const requests = await db.select().from(changeRequest);
      const latest = requests[requests.length - 1];
      expect(latest?.toolLog).toEqual(log);
    } finally {
      await client.close();
    }
  });
});
