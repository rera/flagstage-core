import { loadConfig } from "@flagstage/config";

import { createDb } from "./client";
import { migrateWithLock } from "./migrate";
import { seedDemo } from "./seed";

const command = process.argv[2];
const config = loadConfig();

if (command === "migrate") {
  await migrateWithLock(config.DATABASE_URL);
  console.log("migrations applied");
} else if (command === "seed") {
  const { db, pool } = createDb(config.DATABASE_URL);
  await seedDemo(db);
  await pool.end();
  console.log("demo organization ready");
} else {
  console.error("usage: migrate | seed");
  process.exit(1);
}
