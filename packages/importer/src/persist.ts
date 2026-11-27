import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { importRun, leadForm, site, siteRedirect, snapshot } from "@flagstage/db";
import { materializeOutput, notePublishChecks, writeHostMap } from "@flagstage/publish";
import type { PublishChecks } from "@flagstage/sitebuild";
import { outputPrefix, snapshotPrefix, sourcePrefix, type BlobStore } from "@flagstage/storage";

import { legacyFormPosts, type LegacyFormPost } from "./forms";
import type { ImportResult } from "./types";

const TEXT = new TextDecoder();

export async function storeImport(input: {
  db: Database;
  store: BlobStore;
  siteId: string;
  importRunId: string;
  result: ImportResult;
}): Promise<{ snapshotId: string }> {
  const snapshotId = randomUUID();
  const prefix = snapshotPrefix(input.siteId, snapshotId);
  const files = [...input.result.pages, ...input.result.assets];
  let bytes = 0;
  for (const file of files) {
    await input.store.put(`${sourcePrefix(prefix)}${file.path}`, file.body, file.contentType);
    bytes += file.body.byteLength;
  }
  await materializeOutput({ store: input.store, storagePrefix: prefix });
  const sites = await input.db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const legacy = await legacyPostsInOutput(
    input.store,
    outputPrefix(prefix),
    sites[0]?.sourceUrl ?? null
  );
  const report =
    legacy.length === 0
      ? input.result.report
      : { ...input.result.report, legacyForms: legacyFormRows(legacy) };
  const now = new Date();
  await input.db.insert(snapshot).values({
    id: snapshotId,
    siteId: input.siteId,
    kind: "import",
    storagePrefix: prefix,
    fileCount: files.length,
    bytes,
    createdAt: now
  });
  for (const redirect of input.result.redirects) {
    await input.db
      .insert(siteRedirect)
      .values({
        id: randomUUID(),
        siteId: input.siteId,
        fromPath: redirect.fromPath,
        toPath: redirect.toPath,
        code: 301,
        source: redirect.source
      })
      .onConflictDoNothing();
  }
  for (const form of input.result.forms) {
    await input.db
      .insert(leadForm)
      .values({
        id: randomUUID(),
        siteId: input.siteId,
        formKey: form.formKey,
        name: form.name
      })
      .onConflictDoNothing({ target: [leadForm.siteId, leadForm.formKey] });
  }
  await input.db
    .update(importRun)
    .set({
      status: "preview",
      stats: input.result.stats,
      fidelityReport: report,
      updatedAt: now
    })
    .where(eq(importRun.id, input.importRunId));
  await input.db
    .update(site)
    .set({ status: "preview", draftSnapshotId: snapshotId })
    .where(eq(site.id, input.siteId));
  return { snapshotId };
}

export async function approveImport(input: {
  db: Database;
  store: BlobStore;
  siteId: string;
  snapshotId: string;
  host?: string;
  hostMapPath?: string;
}): Promise<{ ok: boolean; publicPrefix: string; checks: PublishChecks }> {
  const snaps = await input.db
    .select()
    .from(snapshot)
    .where(eq(snapshot.id, input.snapshotId))
    .limit(1);
  const storagePrefix = snaps[0]?.storagePrefix;
  if (!storagePrefix) throw new Error("Import snapshot is missing.");
  const sites = await input.db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const previousId = sites[0]?.currentSnapshotId;
  const previous = previousId
    ? await input.db.select().from(snapshot).where(eq(snapshot.id, previousId)).limit(1)
    : [];
  const built = await materializeOutput({
    store: input.store,
    storagePrefix,
    previousStoragePrefix: previous[0]?.storagePrefix,
    review: previousId ? "later" : "import"
  });
  const checks = built.checks ?? { blocked: false, drift: [], missing: [], ms: 0 };
  const publicPrefix = outputPrefix(storagePrefix);
  const legacy = await legacyPostsInOutput(input.store, publicPrefix, sites[0]?.sourceUrl ?? null);
  if (checks.blocked) {
    await notePublishChecks(input.db, input.siteId, checks);
    await writeLegacyForms(input.db, input.siteId, legacy);
    return { ok: false, publicPrefix, checks };
  }
  await input.db
    .update(site)
    .set({ currentSnapshotId: input.snapshotId, status: "live" })
    .where(eq(site.id, input.siteId));
  if (input.host && input.hostMapPath) writeHostMap(input.hostMapPath, input.host, publicPrefix);
  await notePublishChecks(input.db, input.siteId, checks);
  await writeLegacyForms(input.db, input.siteId, legacy);
  return { ok: true, publicPrefix, checks };
}

async function legacyPostsInOutput(
  store: BlobStore,
  publicPrefix: string,
  sourceUrl: string | null
): Promise<LegacyFormPost[]> {
  if (!sourceUrl) return [];
  let origin: URL;
  try {
    origin = new URL(sourceUrl);
  } catch {
    return [];
  }
  const hits: LegacyFormPost[] = [];
  for (const item of await store.list(publicPrefix)) {
    const rel = item.key.startsWith(publicPrefix) ? item.key.slice(publicPrefix.length) : "";
    if (!isPublicHtml(rel)) continue;
    const object = await store.get(item.key);
    if (!object) continue;
    hits.push(...legacyFormPosts(TEXT.decode(object.body), rel, origin));
  }
  return hits;
}

function isPublicHtml(rel: string): boolean {
  const lower = rel.toLowerCase();
  if (!lower.endsWith(".html") && !lower.endsWith(".htm")) return false;
  const top = rel.split("/")[0];
  return top !== "_inc" && top !== "_templates" && top !== ".flagstage";
}

/**
 * Records forms that still post to the imported site.
 * Overview lists them. The editor shows `publishChecks` only, so this list stays off that screen.
 */
async function writeLegacyForms(
  db: Database,
  siteId: string,
  hits: readonly LegacyFormPost[]
): Promise<void> {
  const runs = await db.select().from(importRun).where(eq(importRun.siteId, siteId));
  const latest = runs
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .at(-1);
  if (!latest) return;
  const report = asReport(latest.fidelityReport);
  const had = Object.prototype.hasOwnProperty.call(report, "legacyForms");
  if (hits.length === 0 && !had) return;
  if (hits.length === 0) delete report.legacyForms;
  else {
    report.legacyForms = legacyFormRows(hits);
  }
  await db
    .update(importRun)
    .set({ fidelityReport: report, updatedAt: new Date() })
    .where(eq(importRun.id, latest.id));
}

function legacyFormRows(hits: readonly LegacyFormPost[]) {
  return hits.map((hit) => ({
    page: hit.page,
    kind: hit.kind,
    detail: hit.detail
  }));
}

function asReport(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}
