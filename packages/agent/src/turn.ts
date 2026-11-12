import { createHash, randomBytes, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { changeRequest, message, previewSession, site, snapshot, thread } from "@flagstage/db";
import { recordPublish, swapLive, writeHostMap } from "@flagstage/publish";
import { snapshotPrefix, type BlobStore } from "@flagstage/storage";

import { checkTrust, decideIntent, mockEdit } from "./runner";
import type { AgentRunner } from "./subprocess";

const text = new TextDecoder();

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
}): Promise<{ threadId: string; reply: string; previewUrl?: string }> {
  const trust = checkTrust(input.body);
  const db = input.db;
  const existing = await db.select().from(thread).where(eq(thread.siteId, input.siteId)).limit(1);
  const threadId = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
    await db
      .insert(thread)
      .values({ id: threadId, siteId: input.siteId, title: "Changes", createdBy: input.userId });
  }
  await db.insert(message).values({
    id: randomUUID(),
    threadId,
    author: "user",
    userId: input.userId,
    body: input.body
  });
  if (input.commentOnly) {
    return { threadId, reply: "" };
  }
  if (!trust.ok) {
    await db
      .insert(message)
      .values({ id: randomUUID(), threadId, author: "system", body: trust.reason });
    return { threadId, reply: trust.reason };
  }
  const intent = decideIntent(input.body);
  if (intent.kind === "ask") {
    const reply = "Which page should change, and what should it say?";
    await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
    return { threadId, reply };
  }
  if (intent.kind === "satisfied") {
    const reply = "Nothing needed changing.";
    await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
    return { threadId, reply };
  }
  const sites = await db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const current = sites[0]?.currentSnapshotId;
  if (!current) {
    const reply = "Publish the import before requesting a change.";
    await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
    return { threadId, reply };
  }
  const snaps = await db.select().from(snapshot).where(eq(snapshot.id, current)).limit(1);
  const prefix = snaps[0]?.storagePrefix;
  if (!prefix) throw new Error("Live snapshot is missing.");
  if (intent.needsHuman && input.allowHold !== false) {
    await db.insert(changeRequest).values({
      id: randomUUID(),
      threadId,
      siteId: input.siteId,
      status: "needs_human",
      sourceSnapshotId: current,
      summary: input.body,
      holdReason: "An account admin has to let this request run."
    });
    const reply = "An account admin has to approve this request before it runs.";
    await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
    await notify(db, threadId);
    return { threadId, reply };
  }
  const edited = await (input.runner ?? { name: "mock", edit: mockEdit }).edit(
    await readSnapshot(input.store, prefix),
    input.body
  );
  if (!edited.changed) {
    const reply = "Nothing needed changing.";
    await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
    return { threadId, reply };
  }
  const resultId = await writeSnapshot({
    db,
    store: input.store,
    siteId: input.siteId,
    parentSnapshotId: current,
    files: edited.files
  });
  const requestId = randomUUID();
  await db.insert(changeRequest).values({
    id: requestId,
    threadId,
    siteId: input.siteId,
    status: "preview_ready",
    sourceSnapshotId: current,
    resultSnapshotId: resultId,
    summary: input.body
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
  const reply = `Preview ready: ${previewUrl}`;
  await db.insert(message).values({ id: randomUUID(), threadId, author: "system", body: reply });
  await db
    .update(thread)
    .set({ status: "preview_ready", updatedAt: new Date() })
    .where(eq(thread.id, threadId));
  await notify(db, threadId);
  return { threadId, reply, previewUrl };
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
    const edited = await (input.runner ?? { name: "mock", edit: mockEdit }).edit(
      await readSnapshot(input.store, prefix),
      request.summary
    );
    if (!edited.changed) return { ok: false, reason: "Nothing needed changing." };
    nextId = await writeSnapshot({
      db: input.db,
      store: input.store,
      siteId: request.siteId,
      parentSnapshotId: live,
      files: edited.files
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
