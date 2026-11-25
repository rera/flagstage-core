import { eq } from "drizzle-orm";

import { loadConfig } from "@flagstage/config";
import type { Database } from "@flagstage/db";
import { site, siteSchedule, snapshot } from "@flagstage/db";
import { cloudfrontKeyValueStore, writeHostPrefix } from "@flagstage/domains";
import { createBlobStore, publicPrefixFor } from "@flagstage/storage";

import { invalidatePublishedKeys } from "./invalidate";
import { writeHostMap } from "./publish";
import { publishRedirects, redirectEdge } from "./redirects";

export async function syncScheduleHost(db: Database, scheduleId: string) {
  const rows = await db.select().from(siteSchedule).where(eq(siteSchedule.id, scheduleId)).limit(1);
  const row = rows[0];
  if (!row) return;
  const sites = await db.select().from(site).where(eq(site.id, row.siteId)).limit(1);
  const current = sites[0];
  if (!current?.currentSnapshotId) return;
  const snaps = await db
    .select()
    .from(snapshot)
    .where(eq(snapshot.id, current.currentSnapshotId))
    .limit(1);
  const storagePrefix = snaps[0]?.storagePrefix;
  if (!storagePrefix) return;
  const config = loadConfig();
  const store = createBlobStore(config);
  const prefix = await publicPrefixFor(store, storagePrefix);
  const host =
    config.NODE_ENV === "production" && config.product?.domain
      ? `${current.slug}.${config.product.domain}`
      : `${current.slug}.localhost`;
  writeHostMap(`${config.FS_STORAGE_DIR}/hostmap.json`, host, prefix);
  const edge = redirectEdge(config);
  if (edge.store && config.CLOUDFRONT_KVS_ARN) {
    await writeHostPrefix(cloudfrontKeyValueStore(config.CLOUDFRONT_KVS_ARN), host, prefix);
    await publishRedirects({ db, siteId: current.id, host, store: edge.store });
  }
  const fromId = row.status === "reverted" ? row.snapshotId : row.revertToSnapshotId;
  const fromRows =
    fromId && fromId !== current.currentSnapshotId
      ? await db.select().from(snapshot).where(eq(snapshot.id, fromId)).limit(1)
      : [];
  await invalidatePublishedKeys({
    store,
    distributionId: config.CLOUDFRONT_DISTRIBUTION_ID,
    fromPrefix: fromRows[0]?.storagePrefix,
    toPrefix: storagePrefix
  });
}
