import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { eq } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { importRun, leadForm, site, siteRedirect, snapshot } from "@flagstage/db";
import { snapshotPrefix, type BlobStore } from "@flagstage/storage";

import type { CrawlResult } from "./types";

export async function storeCrawl(input: {
  db: Database;
  store: BlobStore;
  siteId: string;
  importRunId: string;
  crawl: CrawlResult;
  hostMapPath?: string;
  host?: string;
}): Promise<{ snapshotId: string }> {
  const snapshotId = randomUUID();
  const prefix = snapshotPrefix(input.siteId, snapshotId);
  let bytes = 0;
  for (const file of input.crawl.files) {
    await input.store.put(`${prefix}${file.path}`, file.body, file.contentType);
    bytes += file.body.byteLength;
  }
  const now = new Date();
  await input.db.insert(snapshot).values({
    id: snapshotId,
    siteId: input.siteId,
    kind: "import",
    storagePrefix: prefix,
    fileCount: input.crawl.files.length,
    bytes,
    createdAt: now
  });
  for (const redirect of input.crawl.redirects) {
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
  for (const form of input.crawl.forms) {
    await input.db
      .insert(leadForm)
      .values({
        id: randomUUID(),
        siteId: input.siteId,
        formKey: form.formKey,
        name: form.name
      })
      .onConflictDoNothing();
  }
  await input.db
    .update(importRun)
    .set({
      status: "preview",
      stats: input.crawl.stats,
      fidelityReport: input.crawl.report,
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
  siteId: string;
  snapshotId: string;
  host?: string;
  prefix?: string;
  hostMapPath?: string;
}): Promise<void> {
  await input.db
    .update(site)
    .set({ currentSnapshotId: input.snapshotId, status: "live" })
    .where(eq(site.id, input.siteId));
  if (!input.host || !input.prefix || !input.hostMapPath) return;
  let current: Record<string, string> = {};
  try {
    current = JSON.parse(readFileSync(input.hostMapPath, "utf8")) as Record<string, string>;
  } catch {
    current = {};
  }
  current[input.host] = input.prefix;
  mkdirSync(dirname(input.hostMapPath), { recursive: true });
  writeFileSync(input.hostMapPath, JSON.stringify(current, null, 2));
}
