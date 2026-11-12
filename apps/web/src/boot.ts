import { loadConfig, createLogger } from "@flagstage/config";
import { migrateWithLock, createDb, QUEUE_NAMES } from "@flagstage/db";
import { bootstrapAdmin } from "@flagstage/auth";
import { syncOrganization } from "@flagstage/core";
import { PgBoss } from "pg-boss";

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
  const boss = new PgBoss(config.DATABASE_URL);
  await boss.start();
  for (const name of QUEUE_NAMES) {
    await boss.createQueue(name);
  }
  await boss.stop({ graceful: false, timeout: 5_000 });
  started = true;
  log.info("web boot complete");
}
