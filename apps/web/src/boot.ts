import { loadConfig, createLogger } from "@flagstage/config";
import { migrateWithLock, seedDemo, createDb, QUEUE_NAMES } from "@flagstage/db";
import { bootstrapAdmin } from "@flagstage/auth";
import { hashPassword } from "better-auth/crypto";
import { PgBoss } from "pg-boss";

let started = false;

export async function boot(): Promise<void> {
  if (started) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const config = loadConfig();
  const log = createLogger(config, "web");
  await migrateWithLock(config.DATABASE_URL);
  if (config.SEED_DEMO) {
    const { db, pool } = createDb(config.DATABASE_URL);
    await seedDemo(db, { passwordHash: await hashPassword("demo-demo-demo") });
    await pool.end();
    log.info({ email: "demo@example.com" }, "demo organization seeded");
  }
  {
    const { db, pool } = createDb(config.DATABASE_URL);
    await bootstrapAdmin(db, { email: config.BOOTSTRAP_ADMIN_EMAIL, appUrl: config.APP_URL }, log);
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
