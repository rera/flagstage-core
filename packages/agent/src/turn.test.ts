import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { can, type Principal } from "@flagstage/core";
import {
  account,
  changeRequest,
  previewSession,
  site,
  snapshot,
  user,
  type Database
} from "@flagstage/db";
import * as fullSchema from "@flagstage/db";
import { snapshotPrefix, type BlobStore, type StoredObject } from "@flagstage/storage";

import { approveChange, buildAgentEnv, postMessage, previewForToken } from "./index";
import type { AgentRunner } from "./subprocess";

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
    }
  };
}

const testEditor: AgentRunner = {
  name: "subprocess",
  async edit(files, request) {
    if (request.includes("no change")) return { changed: false, files };
    const key = [...files.keys()].find((name) => name.endsWith("index.html"));
    if (!key) return { changed: false, files };
    const html = new TextDecoder().decode(files.get(key));
    const next = html.includes("</body>")
      ? html.replace("</body>", `<p>${request}</p></body>`)
      : `${html}\n<p>${request}</p>`;
    const copy = new Map(files);
    copy.set(key, new TextEncoder().encode(next));
    return { changed: true, files: copy };
  }
};

async function applyMigrations(client: PGlite) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of ["0000_init.sql", "0001_auth_plugins.sql", "0003_builder.sql", "0004_schedule.sql"]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
}

describe("chat publish", () => {
  it("keeps database and cloud credentials out of the agent environment", () => {
    const env = buildAgentEnv({
      PATH: "/usr/bin",
      DATABASE_URL: "postgres://secret",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_ACCESS_KEY_ID: "key",
      AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/credentials/task",
      AWS_REGION: "us-east-1",
      AGENT_MODEL: "amazon.nova-micro-v1:0"
    });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI).toBe("/v2/credentials/task");
    expect(env.AWS_REGION).toBe("us-east-1");
    expect(env.AGENT_MODEL).toBe("amazon.nova-micro-v1:0");
  });

  it("does not let someone outside the account publish", () => {
    const outsider: Principal = {
      id: "user-1",
      orgRole: "none",
      memberships: []
    };
    expect(can(outsider, "site.publish", { accountId: "acct-1" })).toBe(false);
  });

  it("turns a message into a preview and publishes it", async () => {
    const client = new PGlite();
    const store = memoryStore();
    const hostMapPath = join(mkdtempSync(join(tmpdir(), "hostmap-")), "hostmap.json");
    try {
      await applyMigrations(client);
      const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
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
      const liveId = "snap-live";
      await db.insert(site).values({
        id: "site-1",
        accountId: "acct-1",
        name: "Fixture",
        slug: "fixture",
        status: "live"
      });
      await db.insert(snapshot).values({
        id: liveId,
        siteId: "site-1",
        kind: "import",
        storagePrefix: snapshotPrefix("site-1", liveId),
        fileCount: 1,
        bytes: 32
      });
      await db.update(site).set({ currentSnapshotId: liveId }).where(eq(site.id, "site-1"));
      const html = new TextEncoder().encode("<html><body><h1>Hello</h1></body></html>");
      await store.put(`${snapshotPrefix("site-1", liveId)}index.html`, html, "text/html");

      const asked = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Can you change the headline?",
        appOrigin: "http://localhost:3000",
        runner: testEditor
      });
      expect(asked.previewUrl).toContain("/preview/");

      const same = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "no change needed",
        appOrigin: "http://localhost:3000",
        runner: testEditor
      });
      expect(same.reply).toBe("Nothing needed changing.");

      const posted = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Make the headline warmer",
        appOrigin: "http://localhost:3000",
        runner: testEditor
      });
      expect(posted.previewUrl).toContain("/preview/");
      const token = posted.previewUrl?.split("/preview/")[1] ?? "";
      const session = await previewForToken(db, token);
      expect(session?.snapshotId).toBeTruthy();
      await db
        .update(previewSession)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(previewSession.id, session?.id ?? ""));
      expect(await previewForToken(db, token)).toBeNull();
      await db
        .update(previewSession)
        .set({ expiresAt: new Date(Date.now() + 60_000), status: "ready" })
        .where(eq(previewSession.id, session?.id ?? ""));

      const requests = await db.select().from(changeRequest);
      const request = requests[0];
      expect(request?.status).toBe("preview_ready");
      const published = await approveChange({
        db,
        store,
        changeRequestId: request?.id ?? "",
        actorUserId: "user-1",
        host: "fixture.localhost",
        hostMapPath,
        runner: testEditor
      });
      expect(published.ok).toBe(true);
      const live = await db.select().from(site).where(eq(site.id, "site-1"));
      expect(live[0]?.currentSnapshotId).not.toBe(liveId);
      const map = JSON.parse(readFileSync(hostMapPath, "utf8")) as Record<string, string>;
      expect(map["fixture.localhost"]).toContain(live[0]?.currentSnapshotId ?? "missing");

      const otherId = randomUUID();
      await db.insert(snapshot).values({
        id: otherId,
        siteId: "site-1",
        kind: "edit",
        storagePrefix: snapshotPrefix("site-1", otherId),
        fileCount: 1,
        bytes: 20
      });
      await store.put(
        `${snapshotPrefix("site-1", otherId)}index.html`,
        new TextEncoder().encode("<html><body><h1>Other</h1></body></html>"),
        "text/html"
      );
      await db.update(site).set({ currentSnapshotId: otherId }).where(eq(site.id, "site-1"));
      const second = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Add a footer",
        appOrigin: "http://localhost:3000",
        runner: testEditor
      });
      expect(second.previewUrl).toBeTruthy();
      await db
        .update(site)
        .set({ currentSnapshotId: live[0]?.currentSnapshotId })
        .where(eq(site.id, "site-1"));
      const held = await postMessage({
        db,
        store,
        siteId: "site-1",
        userId: "user-1",
        body: "Please delete the entire site",
        appOrigin: "http://localhost:3000",
        runner: testEditor
      });
      expect(held.previewUrl).toContain("/preview/");

      const staleRequests = await db
        .select()
        .from(changeRequest)
        .where(eq(changeRequest.status, "preview_ready"));
      const stale = staleRequests[staleRequests.length - 1];
      const rebuilt = await approveChange({
        db,
        store,
        changeRequestId: stale?.id ?? "",
        actorUserId: "user-1",
        runner: testEditor
      });
      expect(rebuilt.ok).toBe(true);
      if (rebuilt.ok) expect(rebuilt.snapshotId).not.toBe(stale?.resultSnapshotId);
    } finally {
      await client.close();
    }
  });
});
