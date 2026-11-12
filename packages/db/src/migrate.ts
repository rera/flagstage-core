import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const LOCK_KEY = 8420261112;

export function migrationsFolder(): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), "../drizzle"),
    join(process.cwd(), "packages/db/drizzle"),
    join(process.cwd(), "drizzle")
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "meta/_journal.json"))) return candidate;
  }
  throw new Error(`Could not find database migrations. Looked in:\n${candidates.join("\n")}`);
}

export async function migrateWithLock(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const db = drizzle(pool);
  await db.execute(sql`SELECT pg_advisory_lock(${LOCK_KEY})`);
  try {
    await migrate(db, { migrationsFolder: migrationsFolder() });
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_KEY})`);
    await pool.end();
  }
}
