import pg from "pg";

import { ConfigError, loadConfig } from "@flagstage/config";
import { createBlobStore } from "@flagstage/storage";

const [command, ...args] = process.argv.slice(2);

function usage(): never {
  console.log(`flagstage commands:
  doctor
  create-admin <email>
  create-account <name>
  add-member <account-slug> <email> <role>
  import <account-slug> <url>
  reset-password <email>
  export-site <site-slug> <directory>`);
  process.exit(command ? 1 : 0);
}

if (!command || command === "help" || command === "--help") {
  usage();
}

if (command === "doctor") {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const lines = [
    `env: ok (${config.NODE_ENV})`,
    `storage: ${config.STORAGE_DRIVER}`,
    `ai: ${config.AI_MOCK ? "mock" : config.AI_PROVIDER}`,
    `smtp: ${config.SMTP_URL ? "configured" : "console"}`
  ];
  try {
    const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
    await pool.query("select 1");
    await pool.end();
    lines.push("db: ok");
  } catch (error) {
    lines.push(`db: fail (${error instanceof Error ? error.message : "unknown"})`);
  }
  try {
    const store = createBlobStore(config);
    await store.put("health/doctor.txt", new TextEncoder().encode("ok"));
    lines.push("storage write: ok");
  } catch (error) {
    lines.push(`storage write: fail (${error instanceof Error ? error.message : "unknown"})`);
  }
  if (!config.AI_MOCK && !config.AI_API_KEY && config.AI_PROVIDER !== "bedrock") {
    lines.push("ai key: missing");
  } else {
    lines.push("ai key: ok");
  }
  console.log(lines.join("\n"));
  process.exit(lines.some((line) => line.includes("fail") || line.includes("missing")) ? 1 : 0);
}

console.error(`'${command}' is not available yet.`, args.length ? "" : "");
usage();
