import { loadConfig, createLogger } from "@flagstage/config";
import { migrateWithLock, createDb, getDb } from "@flagstage/db";
import { bootstrapAdmin } from "@flagstage/auth";
import { syncOrganization } from "@flagstage/core";
import { rollupStored } from "@flagstage/analytics";
import { publicDnsLookup, recheckDueDomains, selectDomainsDriver } from "@flagstage/domains";
import {
  RedirectMapError,
  recentPublishedSchedules,
  redirectEdge,
  runDueSchedules,
  syncScheduleHost
} from "@flagstage/publish";
import { createBlobStore } from "@flagstage/storage";

let started = false;
const syncedEdge = new Set<string>();

export async function boot(): Promise<void> {
  if (started) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const config = loadConfig();
  const log = createLogger(config, "web");
  await migrateWithLock(config.DATABASE_URL);
  {
    const { db, pool } = createDb(config.DATABASE_URL);
    if (config.product) {
      await syncOrganization(db, { name: config.product.orgName, domain: config.product.domain });
    }
    await bootstrapAdmin(db, { email: config.product?.adminEmail, appUrl: config.APP_URL }, log);
    await pool.end();
  }
  const maintenance = async () => {
    const current = loadConfig();
    const db = getDb(current.DATABASE_URL);
    await rollupStored(db).catch(() => undefined);
    const driver = await selectDomainsDriver(current);
    await recheckDueDomains(db, publicDnsLookup(), new Date(), async (row) => {
      if (!row.cloudfrontTenantId || current.DOMAINS_DRIVER !== "cloudfront-tenants") return null;
      return driver.read(row.cloudfrontTenantId, row.hostname);
    }).catch(() => undefined);
  };
  setInterval(() => void maintenance(), 10 * 60 * 1000);
  const tickSchedules = async () => {
    const current = loadConfig();
    const db = getDb(current.DATABASE_URL);
    const edge = redirectEdge(current);
    const applied = await runDueSchedules(db, new Date(), createBlobStore(current), edge).catch(
      (error: unknown) => {
        log.error({ err: error }, "scheduled publish failed");
        return [] as string[];
      }
    );
    const pending = new Map<string, string>();
    for (const id of applied) pending.set(id, `applied:${id}`);
    const recent = await recentPublishedSchedules(
      db,
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).catch(() => []);
    for (const row of recent) pending.set(row.id, `${row.id}:${row.updatedAt.getTime()}`);
    for (const [id, token] of pending) {
      if (syncedEdge.has(token)) continue;
      try {
        await syncScheduleHost(db, id);
        syncedEdge.add(token);
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "scheduled publish did not update the edge";
        log.error({ err: error, scheduleId: id }, text);
        if (error instanceof RedirectMapError) syncedEdge.add(token);
      }
    }
  };
  setInterval(() => void tickSchedules(), 5_000);
  void tickSchedules();
  started = true;
  log.info("web boot complete");
}
