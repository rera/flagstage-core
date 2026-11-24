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
import {
  snapshotPrefix,
  sourcePrefix,
  type BlobStore,
  type StoredObject
} from "@flagstage/storage";

import { postMessage } from "./turn";
import { HAND_EDIT_GUIDANCE } from "./site-tools/guard";
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

function marked(files: Map<string, Uint8Array>, count: number): Map<string, Uint8Array> {
  const next = new Map(files);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    const path = `p/${index}.html`;
    const current = decoder.decode(next.get(path) ?? new Uint8Array());
    next.set(path, encoder.encode(`${current}\n<!-- edited -->`));
  }
  return next;
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

const TOOL_NAMES = [
  "find_pages",
  "read_page",
  "edit_include",
  "set_meta",
  "retag",
  "replace_text",
  "list_links",
  "hand_edit_guard"
];

function textOf(store: ReturnType<typeof memoryStore>, key: string): string {
  const body = store.files.get(key)?.body;
  return body ? new TextDecoder().decode(body) : "";
}

describe("hand-edit guard", () => {
  it("asks the editor to retry with the tools, then keeps that edit", async () => {
    const { db, client, store } = await ready();
    const seen: Array<string | undefined> = [];
    const runner: AgentRunner = {
      name: "subprocess",
      async edit(files, _request, guidance) {
        seen.push(guidance);
        const page = new TextDecoder().decode(files.get("p/0.html") ?? new Uint8Array());
        expect(page).not.toContain("<!-- edited -->");
        if (!guidance) {
          return {
            changed: true,
            files: marked(files, 9),
            reply: "I used find_pages on nine pages."
          };
        }
        const next = new Map(files);
        next.set("_inc/0.html", new TextEncoder().encode("<p>shared</p>"));
        return {
          changed: true,
          files: next,
          reply: "The shared block is updated.",
          toolLog: [
            {
              tool: "edit_include",
              mode: "apply",
              files: ["_inc/0.html"],
              at: "2026-11-22T00:00:00.000Z"
            }
          ]
        };
      }
    };
    try {
      const result = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Sweep nine pages",
        appOrigin: "http://localhost:3000",
        runner
      });
      expect(seen).toEqual([undefined, HAND_EDIT_GUIDANCE]);
      expect(result.reply).toBe("Preview updated");
      const notes = await db.select().from(message);
      const visible = notes.map((item) => item.body).join("\n");
      for (const name of TOOL_NAMES) expect(visible).not.toContain(name);
      expect(visible).not.toContain("I used find_pages");
      const requests = await db.select().from(changeRequest);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.status).toBe("preview_ready");
      const log = requests[0]?.toolLog as ToolCallRecord[];
      expect(log.map((entry) => `${entry.tool}:${entry.mode}`)).toEqual([
        "hand_edit_guard:refuse",
        "hand_edit_guard:retry",
        "edit_include:apply"
      ]);
      expect(log[0]?.files).toHaveLength(9);
      const draft = await draftId(db);
      expect(draft).toBeTruthy();
      const prefix = sourcePrefix(snapshotPrefix("site-1", draft ?? ""));
      expect(textOf(store, `${prefix}p/0.html`)).not.toContain("<!-- edited -->");
      expect(textOf(store, `${prefix}_inc/0.html`)).toBe("<p>shared</p>");
    } finally {
      await client.close();
    }
  });

  it("stops after one retry and shows only the editor's plain reply", async () => {
    const { db, client, store } = await ready();
    const plain = "I couldn't change those pages. Our team can take a look.";
    let calls = 0;
    const runner: AgentRunner = {
      name: "subprocess",
      async edit(files, _request, guidance) {
        calls += 1;
        if (calls > 2) throw new Error("retried more than once");
        return {
          changed: true,
          files: marked(files, 9),
          reply: guidance ? plain : "I used find_pages and edit_include."
        };
      }
    };
    try {
      const result = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Sweep nine pages",
        appOrigin: "http://localhost:3000",
        runner
      });
      expect(calls).toBe(2);
      expect(result.reply).toBe(plain);
      expect(await draftId(db)).toBeNull();
      for (const object of store.files.values()) {
        expect(new TextDecoder().decode(object.body)).not.toContain("<!-- edited -->");
      }
      const notes = await db.select().from(message);
      const visible = notes.map((item) => item.body).join("\n");
      expect(visible).toContain(plain);
      for (const name of TOOL_NAMES) expect(visible).not.toContain(name);
      const requests = await db.select().from(changeRequest);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.status).toBe("ended");
      expect(requests[0]?.resultSnapshotId ?? null).toBeNull();
      const log = requests[0]?.toolLog as ToolCallRecord[];
      expect(log.filter((entry) => entry.mode === "refuse")).toHaveLength(2);
      expect(log.filter((entry) => entry.mode === "retry")).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it("allows a handful of hand-edited pages", async () => {
    const { db, client, store } = await ready();
    let calls = 0;
    const runner: AgentRunner = {
      name: "subprocess",
      async edit(files, request, guidance) {
        calls += 1;
        expect(guidance).toBeUndefined();
        const edited = editing(Array.from({ length: 8 }, (_, index) => `p/${index}.html`));
        return edited.edit(files, request);
      }
    };
    try {
      const allowed = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Touch eight pages",
        appOrigin: "http://localhost:3000",
        runner
      });
      expect(calls).toBe(1);
      expect(allowed.reply).toBe("Preview updated");
      const requests = await db.select().from(changeRequest);
      expect(requests[0]?.toolLog).toEqual([]);
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
