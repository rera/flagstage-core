import { loadConfig } from "@flagstage/config";
import { can, type Principal } from "@flagstage/core";
import { site, snapshot } from "@flagstage/db";
import { eq } from "drizzle-orm";
import { cloudfrontKeyValueStore, writeHostPrefix } from "@flagstage/domains";
import {
  invalidatePublishedKeys,
  materializeOutput,
  notePublishChecks,
  publishRedirects,
  recordPublish,
  redirectEdge,
  swapLive,
  writeHostMap
} from "@flagstage/publish";
import { createBlobStore, outputPrefix } from "@flagstage/storage";

import { database } from "./guard";

function liveHost(slug: string) {
  const config = loadConfig();
  const domain = config.NODE_ENV === "production" ? config.product?.domain : undefined;
  return domain ? `${slug}.${domain}` : `${slug}.localhost`;
}

async function publishHostMap(host: string | undefined, prefix: string | undefined) {
  if (!host || !prefix) return;
  const config = loadConfig();
  if (config.HOSTMAP_DRIVER !== "cloudfront-kvs" || !config.CLOUDFRONT_KVS_ARN) return;
  await writeHostPrefix(cloudfrontKeyValueStore(config.CLOUDFRONT_KVS_ARN), host, prefix);
}

async function publishEdgeRedirects(siteId: string, host: string) {
  const edge = redirectEdge(loadConfig());
  if (!edge.store) return;
  await publishRedirects({ db: database(), siteId, host, store: edge.store });
}

async function invalidateLive(fromPrefix: string | null | undefined, toPrefix: string | undefined) {
  if (!toPrefix) return;
  const config = loadConfig();
  await invalidatePublishedKeys({
    store: createBlobStore(config),
    distributionId: config.CLOUDFRONT_DISTRIBUTION_ID,
    fromPrefix,
    toPrefix
  });
}

export async function publishDraftFor(input: {
  principal: Principal;
  siteId: string;
  snapshotId: string;
}): Promise<"ok" | "denied" | "failed"> {
  const db = database();
  const rows = await db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const found = rows[0];
  if (
    !found ||
    !can(input.principal, "site.publish", { accountId: found.accountId, siteId: found.id })
  ) {
    return "denied";
  }
  const snaps = await db.select().from(snapshot).where(eq(snapshot.id, input.snapshotId)).limit(1);
  if (!found.currentSnapshotId || !snaps[0] || found.draftSnapshotId !== input.snapshotId) {
    return "failed";
  }
  const previous = await db
    .select()
    .from(snapshot)
    .where(eq(snapshot.id, found.currentSnapshotId))
    .limit(1);
  const config = loadConfig();
  const built = await materializeOutput({
    store: createBlobStore(config),
    storagePrefix: snaps[0].storagePrefix,
    previousStoragePrefix: previous[0]?.storagePrefix,
    review: "later"
  });
  await notePublishChecks(
    db,
    input.siteId,
    built.checks ?? { blocked: false, drift: [], missing: [], ms: 0 }
  );
  await publishEdgeRedirects(input.siteId, liveHost(found.slug));
  const swapped = await swapLive(db, input.siteId, found.currentSnapshotId, input.snapshotId);
  if (!swapped) return "failed";
  await recordPublish({
    db,
    siteId: input.siteId,
    fromSnapshotId: found.currentSnapshotId,
    toSnapshotId: input.snapshotId,
    actorUserId: input.principal.id,
    kind: "publish"
  });
  const publicPrefix = outputPrefix(snaps[0].storagePrefix);
  writeHostMap(`${config.FS_STORAGE_DIR}/hostmap.json`, liveHost(found.slug), publicPrefix);
  await publishHostMap(liveHost(found.slug), publicPrefix);
  await invalidateLive(previous[0]?.storagePrefix, snaps[0].storagePrefix);
  return "ok";
}
