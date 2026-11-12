import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { changeRequest, message, previewSession, site, snapshot, thread } from "@flagstage/db";
import { recordPublish, swapLive, writeHostMap } from "@flagstage/publish";
import { snapshotPrefix, type BlobStore } from "@flagstage/storage";

import { injectAnalytics } from "@flagstage/analytics";

import { maybeAlertBudget } from "./budget";
import { checkTrust } from "./runner";
import type { AgentRunner } from "./subprocess";

const LOCK_MS = 15 * 60 * 1000;

function sessionPrefix(siteId: string): string {
  return `sites/${siteId}/session/`;
}

function estimateUsage(request: string, files: Map<string, Uint8Array>) {
  const inputTokens = Math.max(1, Math.ceil(request.length / 4));
  let outputBytes = 0;
  for (const body of files.values()) outputBytes += body.byteLength;
  const outputTokens = Math.max(1, Math.ceil(outputBytes / 4));
  const estimatedUsd = (inputTokens / 1000) * 0.000035 + (outputTokens / 1000) * 0.00014;
  return { inputTokens, outputTokens, estimatedUsd, estimated: true };
}

async function loadSession(
  store: BlobStore,
  siteId: string
): Promise<Map<string, Uint8Array> | "missing" | "corrupt"> {
  const prefix = sessionPrefix(siteId);
  let items: Array<{ key: string }>;
  try {
    items = await store.list(prefix);
  } catch {
    return "corrupt";
  }
  if (items.length === 0) return "missing";
  const ready = await store.get(`${prefix}_ready`);
  if (!ready) return "corrupt";
  if (text.decode(ready.body) !== "ok") return "missing";
  const files = new Map<string, Uint8Array>();
  for (const item of items) {
    if (item.key.endsWith("/_ready")) continue;
    const object = await store.get(item.key);
    if (!object) return "corrupt";
    files.set(item.key.slice(prefix.length), object.body);
  }
  return files;
}

async function saveSession(store: BlobStore, siteId: string, files: Map<string, Uint8Array>) {
  const prefix = sessionPrefix(siteId);
  for (const [path, body] of files) {
    await store.put(`${prefix}${path}`, body, "application/octet-stream");
  }
  await store.put(`${prefix}_ready`, encoder.encode("ok"), "text/plain");
}

const text = new TextDecoder();
const encoder = new TextEncoder();

function withAnalytics(
  files: Map<string, Uint8Array>,
  enabled: boolean,
  appOrigin: string,
  siteId: string
) {
  const next = new Map(files);
  for (const [path, body] of files) {
    if (!path.endsWith(".html")) continue;
    next.set(path, encoder.encode(injectAnalytics(text.decode(body), appOrigin, siteId, enabled)));
  }
  return next;
}

async function notify(db: Database, threadId: string) {
  try {
    await db.execute(sql`select pg_notify('flagstage_chat', ${threadId})`);
  } catch {
    // Drivers without NOTIFY still refresh from the 2 second poll.
  }
}

async function readSnapshot(store: BlobStore, prefix: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const item of await store.list(prefix)) {
    const object = await store.get(item.key);
    if (!object) continue;
    files.set(item.key.slice(prefix.length), object.body);
  }
  return files;
}

async function writeSnapshot(input: {
  db: Database;
  store: BlobStore;
  siteId: string;
  parentSnapshotId: string;
  files: Map<string, Uint8Array>;
}): Promise<string> {
  const snapshotId = randomUUID();
  const prefix = snapshotPrefix(input.siteId, snapshotId);
  let bytes = 0;
  for (const [path, body] of input.files) {
    const type = path.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
    await input.store.put(`${prefix}${path}`, body, type);
    bytes += body.byteLength;
  }
  await input.db.insert(snapshot).values({
    id: snapshotId,
    siteId: input.siteId,
    parentSnapshotId: input.parentSnapshotId,
    kind: "edit",
    storagePrefix: prefix,
    fileCount: input.files.size,
    bytes
  });
  return snapshotId;
}

export async function postMessage(input: {
  db: Database;
  store: BlobStore;
  siteId: string;
  userId: string;
  body: string;
  appOrigin: string;
  runner?: AgentRunner;
  commentOnly?: boolean;
  allowHold?: boolean;
  userRecorded?: boolean;
  deadlineMs?: number;
  continuation?: boolean;
}): Promise<{ threadId: string; reply: string; previewUrl?: string; continue?: boolean }> {
  const trust = checkTrust(input.body);
  const db = input.db;
  const existing = await db.select().from(thread).where(eq(thread.siteId, input.siteId)).limit(1);
  const threadId = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
    await db
      .insert(thread)
      .values({ id: threadId, siteId: input.siteId, title: "Changes", createdBy: input.userId });
  }
  if (!input.userRecorded) {
    await db.insert(message).values({
      id: randomUUID(),
      threadId,
      author: "user",
      userId: input.userId,
      body: input.body
    });
  }
  const finish = async (status: string, reply: string, previewUrl?: string) => {
    await db.update(thread).set({ status, updatedAt: new Date() }).where(eq(thread.id, threadId));
    await notify(db, threadId);
    return { threadId, reply, previewUrl };
  };
  if (input.commentOnly) {
    return { threadId, reply: "" };
  }
  if (!trust.ok) {
    await db
      .insert(message)
      .values({ id: randomUUID(), threadId, author: "system", body: trust.reason });
    return finish("open", trust.reason);
  }
  const sites = await db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const currentSite = sites[0];
  const lockFresh =
    currentSite?.draftLockedAt != null &&
    Date.now() - currentSite.draftLockedAt.getTime() < LOCK_MS;
  if (currentSite?.draftLockedBy && currentSite.draftLockedBy !== input.userId && lockFresh) {
    const reply = "Someone else is editing this site.";
    await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
    return finish("open", reply);
  }
  const listed = await db.select().from(snapshot).where(eq(snapshot.siteId, input.siteId));
  const baseId =
    currentSite?.draftSnapshotId ||
    currentSite?.currentSnapshotId ||
    listed.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()).at(-1)?.id;
  if (!baseId) {
    const reply = "Import the site before chatting.";
    await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
    return finish("open", reply);
  }
  const snaps = await db.select().from(snapshot).where(eq(snapshot.id, baseId)).limit(1);
  const prefix = snaps[0]?.storagePrefix;
  if (!prefix) throw new Error("Draft snapshot is missing.");
  await db
    .update(site)
    .set({ draftLockedBy: input.userId, draftLockedAt: new Date() })
    .where(eq(site.id, input.siteId));
  try {
    const session = await loadSession(input.store, input.siteId);
    const baseFiles = await readSnapshot(input.store, prefix);
    let files = baseFiles;
    let request = input.body;
    if (session === "corrupt") {
      const recent = await db.select().from(message).where(eq(message.threadId, threadId));
      const summary = recent
        .slice(-8)
        .map((item) => `${item.author}: ${item.body}`)
        .join("\n");
      request = `The saved editor session was missing or unreadable. Continue from this transcript.\n${summary}\n\n${input.body}`;
    } else if (session !== "missing") {
      files = session;
    }
    if (input.deadlineMs && input.deadlineMs - Date.now() < 60_000) {
      await saveSession(input.store, input.siteId, files);
      const reply = "Saving this turn and continuing in a new run.";
      await db
        .insert(message)
        .values({ id: randomUUID(), threadId, author: "system", body: reply });
      return { ...(await finish("queued", reply)), continue: true };
    }
    if (!input.runner) throw new Error("No editor is configured.");
    let edited: { changed: boolean; files: Map<string, Uint8Array> };
    try {
      edited = await input.runner.edit(files, request);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "";
      if (input.deadlineMs && /timed out/i.test(messageText)) {
        await saveSession(input.store, input.siteId, files);
        const reply = "Saving this turn and continuing in a new run.";
        await db
          .insert(message)
          .values({ id: randomUUID(), threadId, author: "system", body: reply });
        return { ...(await finish("queued", reply)), continue: true };
      }
      throw error;
    }
    if (!edited.changed) {
      const reply = "Nothing needed changing.";
      await db
        .insert(message)
        .values({ id: randomUUID(), threadId, author: "system", body: reply });
      return finish("open", reply);
    }
    const resultId = await writeSnapshot({
      db,
      store: input.store,
      siteId: input.siteId,
      parentSnapshotId: baseId,
      files: withAnalytics(
        edited.files,
        sites[0]?.analyticsEnabled !== false,
        input.appOrigin,
        input.siteId
      )
    });
    await db.update(site).set({ draftSnapshotId: resultId }).where(eq(site.id, input.siteId));
    await input.store.put(
      `${sessionPrefix(input.siteId)}_ready`,
      encoder.encode("done"),
      "text/plain"
    );
    const requestId = randomUUID();
    await db.insert(changeRequest).values({
      id: requestId,
      threadId,
      siteId: input.siteId,
      status: "preview_ready",
      sourceSnapshotId: baseId,
      resultSnapshotId: resultId,
      summary: input.body,
      usage: estimateUsage(input.body, edited.files)
    });
    const token = randomBytes(18).toString("base64url");
    await db.insert(previewSession).values({
      id: randomUUID(),
      siteId: input.siteId,
      changeRequestId: requestId,
      snapshotId: resultId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    const previewUrl = `${input.appOrigin}/preview/${token}`;
    const reply = "Preview updated";
    await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
    if (currentSite?.accountId) {
      await maybeAlertBudget(db, currentSite.accountId).catch(() => undefined);
    }
    return finish("preview_ready", reply, previewUrl);
  } finally {
    await db
      .update(site)
      .set({ draftLockedBy: null, draftLockedAt: null })
      .where(and(eq(site.id, input.siteId), eq(site.draftLockedBy, input.userId)));
  }
}

export async function undoEdit(db: Database, siteId: string): Promise<boolean> {
  const sites = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const draftId = sites[0]?.draftSnapshotId;
  if (!draftId) return false;
  const snaps = await db.select().from(snapshot).where(eq(snapshot.id, draftId)).limit(1);
  const parent = snaps[0]?.parentSnapshotId;
  if (!parent || snaps[0]?.kind !== "edit") return false;
  await db.update(site).set({ draftSnapshotId: parent }).where(eq(site.id, siteId));
  return true;
}

export async function previewForToken(db: Database, token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const rows = await db
    .select()
    .from(previewSession)
    .where(eq(previewSession.tokenHash, tokenHash))
    .limit(1);
  const session = rows[0];
  if (!session || session.expiresAt.getTime() < Date.now() || session.status !== "ready")
    return null;
  return session;
}

export async function approveChange(input: {
  db: Database;
  store: BlobStore;
  changeRequestId: string;
  actorUserId: string;
  host?: string;
  hostMapPath?: string;
  runner?: AgentRunner;
  appOrigin?: string;
}): Promise<{ ok: true; snapshotId: string } | { ok: false; reason: string }> {
  const requests = await input.db
    .select()
    .from(changeRequest)
    .where(eq(changeRequest.id, input.changeRequestId))
    .limit(1);
  const request = requests[0];
  if (!request?.resultSnapshotId || !request.sourceSnapshotId || !request.summary) {
    return { ok: false, reason: "This change is not ready to publish." };
  }
  const sites = await input.db.select().from(site).where(eq(site.id, request.siteId)).limit(1);
  const live = sites[0]?.currentSnapshotId ?? null;
  let nextId = request.resultSnapshotId;
  if (live !== request.sourceSnapshotId) {
    if (!live) return { ok: false, reason: "There is no live snapshot to rebuild from." };
    const snaps = await input.db.select().from(snapshot).where(eq(snapshot.id, live)).limit(1);
    const prefix = snaps[0]?.storagePrefix;
    if (!prefix) return { ok: false, reason: "Live snapshot is missing." };
    if (!input.runner) return { ok: false, reason: "No editor is configured." };
    const edited = await input.runner.edit(
      await readSnapshot(input.store, prefix),
      request.summary
    );
    if (!edited.changed) return { ok: false, reason: "Nothing needed changing." };
    nextId = await writeSnapshot({
      db: input.db,
      store: input.store,
      siteId: request.siteId,
      parentSnapshotId: live,
      files: input.appOrigin
        ? withAnalytics(
            edited.files,
            sites[0]?.analyticsEnabled !== false,
            input.appOrigin,
            request.siteId
          )
        : edited.files
    });
  }
  const expected = live;
  const swapped = await swapLive(input.db, request.siteId, expected, nextId);
  if (!swapped)
    return { ok: false, reason: "The live site changed again. Refresh and try once more." };
  await recordPublish({
    db: input.db,
    siteId: request.siteId,
    fromSnapshotId: expected,
    toSnapshotId: nextId,
    actorUserId: input.actorUserId,
    kind: "publish"
  });
  await input.db
    .update(changeRequest)
    .set({ status: "published", resultSnapshotId: nextId, updatedAt: new Date() })
    .where(eq(changeRequest.id, request.id));
  await input.db
    .update(previewSession)
    .set({ status: "expired" })
    .where(eq(previewSession.changeRequestId, request.id));
  if (input.host && input.hostMapPath) {
    writeHostMap(input.hostMapPath, input.host, snapshotPrefix(request.siteId, nextId));
  }
  return { ok: true, snapshotId: nextId };
}

export function htmlOf(files: Map<string, Uint8Array>, suffix = "index.html"): string {
  const key = [...files.keys()].find((name) => name.endsWith(suffix));
  return key ? text.decode(files.get(key)) : "";
}
