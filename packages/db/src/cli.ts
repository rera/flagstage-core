import { loadConfig } from "@flagstage/config";

import { migrateWithLock } from "./migrate";

const command = process.argv[2];
const config = loadConfig();

if (command === "migrate") {
  await migrateWithLock(config.DATABASE_URL);
  console.log("migrations applied");
} else {
  console.error("usage: migrate");
  process.exit(1);
}
