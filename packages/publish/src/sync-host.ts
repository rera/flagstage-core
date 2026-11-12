import { eq } from "drizzle-orm";

import { loadConfig } from "@flagstage/config";
import type { Database } from "@flagstage/db";
import { site, siteSchedule, snapshot } from "@flagstage/db";
import { cloudfrontKeyValueStore, writeHostPrefix } from "@flagstage/domains";

import { writeHostMap } from "./publish";

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
  const prefix = snaps[0]?.storagePrefix;
  if (!prefix) return;
  const config = loadConfig();
  const host =
    config.NODE_ENV === "production" && config.product?.domain
      ? `${current.slug}.${config.product.domain}`
      : `${current.slug}.localhost`;
  writeHostMap(`${config.FS_STORAGE_DIR}/hostmap.json`, host, prefix);
  if (config.HOSTMAP_DRIVER === "cloudfront-kvs" && config.CLOUDFRONT_KVS_ARN) {
    await writeHostPrefix(cloudfrontKeyValueStore(config.CLOUDFRONT_KVS_ARN), host, prefix);
  }
}
