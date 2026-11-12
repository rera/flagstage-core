import { loadConfig, createLogger } from "@flagstage/config";
import { migrateWithLock, createDb, getDb } from "@flagstage/db";
import { bootstrapAdmin } from "@flagstage/auth";
import { syncOrganization } from "@flagstage/core";
import { rollupStored } from "@flagstage/analytics";
import { publicDnsLookup, recheckDueDomains, selectDomainsDriver } from "@flagstage/domains";

let started = false;

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
  started = true;
  log.info("web boot complete");
}
