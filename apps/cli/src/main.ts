import pg from "pg";

import { ConfigError, loadConfig } from "@flagstage/config";
import { createDb } from "@flagstage/db";
import { createBlobStore } from "@flagstage/storage";

import { addOrgAdmin, createNamedAccount, importAccountSite, parseCommand } from "./commands";

const usage = `flagstage commands:
  doctor
  admin add --email <email> [--name <name>]
  account create <name>
  import <url> --account <slug> [--name <name>]`;

const parsed = (() => {
  try {
    return parseCommand(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not read the command.");
    console.error(usage);
    process.exit(1);
  }
})();

if (parsed.kind === "help") {
  console.log(usage);
  process.exit(0);
}

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

if (parsed.kind === "doctor") {
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

const { db, pool } = createDb(config.DATABASE_URL);
try {
  if (parsed.kind === "admin-add") {
    const result = await addOrgAdmin(db, { email: parsed.email, name: parsed.name });
    if (result.created) {
      console.log(`organization admin ${result.email}`);
      console.log(`password: ${result.password}`);
    } else {
      console.log(`${result.email} is an organization admin`);
    }
  } else if (parsed.kind === "account-create") {
    const created = await createNamedAccount(db, parsed.name);
    console.log(`${created.name} ${created.slug} ${created.id}`);
  } else if (parsed.kind === "import") {
    const imported = await importAccountSite({
      db,
      store: createBlobStore(config),
      accountSlug: parsed.account,
      url: parsed.url,
      name: parsed.name,
      appOrigin: config.APP_URL,
      caps: {
        maxPages: config.IMPORT_MAX_PAGES,
        maxDepth: config.IMPORT_MAX_DEPTH,
        maxAssets: config.IMPORT_MAX_ASSETS
      }
    });
    console.log(`${imported.slug} ${imported.siteId} ${imported.snapshotId}`);
  }
} finally {
  await pool.end();
}
