import { loadConfig } from "@flagstage/config";
import { createDb } from "@flagstage/db";
import { createBlobStore } from "@flagstage/storage";
import { sql } from "drizzle-orm";

export async function GET() {
  const checks: Record<string, "ok" | "fail"> = { db: "fail", storage: "fail" };
  try {
    const config = loadConfig();
    const { db, pool } = createDb(config.DATABASE_URL);
    try {
      await db.execute(sql`select 1`);
      checks.db = "ok";
    } finally {
      await pool.end();
    }
    const store = createBlobStore(config);
    const key = "health/ready.txt";
    await store.put(key, new TextEncoder().encode("ok"), "text/plain; charset=utf-8");
    const stored = await store.get(key);
    if (stored) checks.storage = "ok";
  } catch {
    // readiness stays failed; the body names which check did not pass
  }
  const ok = Object.values(checks).every((value) => value === "ok");
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
