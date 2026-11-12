import { loadConfig, createLogger } from "@flagstage/config";
import { migrateWithLock, seedDemo, createDb, QUEUE_NAMES } from "@flagstage/db";
import { bootstrapAdmin } from "@flagstage/auth";
import { writeHostMap } from "@flagstage/publish";
import { createBlobStore } from "@flagstage/storage";
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
    const demo = await seedDemo(db, { passwordHash: await hashPassword("demo-demo-demo") });
    await pool.end();
    if (demo) {
      const store = createBlobStore(config);
      const key = `${demo.prefix}index.html`;
      if (!(await store.get(key))) {
        await store.put(key, new TextEncoder().encode(demo.html), "text/html; charset=utf-8");
        writeHostMap(
          `${config.FS_STORAGE_DIR}/hostmap.json`,
          `${demo.slug}.localhost`,
          demo.prefix
        );
      }
    }
    log.info({ email: "demo@example.com", site: demo?.slug }, "demo organization seeded");
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
