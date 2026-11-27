import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { importRun, leadForm, site, siteRedirect, snapshot } from "@flagstage/db";
import { materializeOutput, notePublishChecks, writeHostMap } from "@flagstage/publish";
import type { PublishChecks } from "@flagstage/sitebuild";
import { outputPrefix, snapshotPrefix, sourcePrefix, type BlobStore } from "@flagstage/storage";

import type { ImportResult } from "./types";

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
      fidelityReport: input.result.report,
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
  if (checks.blocked) {
    await notePublishChecks(input.db, input.siteId, checks);
    return { ok: false, publicPrefix, checks };
  }
  await input.db
    .update(site)
    .set({ currentSnapshotId: input.snapshotId, status: "live" })
    .where(eq(site.id, input.siteId));
  if (input.host && input.hostMapPath) writeHostMap(input.hostMapPath, input.host, publicPrefix);
  await notePublishChecks(input.db, input.siteId, checks);
  return { ok: true, publicPrefix, checks };
}
