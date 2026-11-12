import { loadConfig } from "@flagstage/config";
import { createDb } from "@flagstage/db";
import { sql } from "drizzle-orm";

export async function GET(request: Request) {
  const config = loadConfig();
  if (!config.METRICS_TOKEN) {
    return new Response("not found", { status: 404 });
  }
  if (request.headers.get("authorization") !== `Bearer ${config.METRICS_TOKEN}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    const result = await db.execute<{
      imports: number;
      publishes: number;
      turns: number;
    }>(sql`
      select
        (select count(*)::int from import_run) as imports,
        (select count(*)::int from publish_event) as publishes,
        (select count(*)::int from change_request) as turns
    `);
    const row = result.rows[0] ?? { imports: 0, publishes: 0, turns: 0 };
    const body = [
      "# HELP flagstage_imports_total Import runs recorded.",
      "# TYPE flagstage_imports_total counter",
      `flagstage_imports_total ${row.imports}`,
      "# HELP flagstage_publishes_total Publish and rollback events.",
      "# TYPE flagstage_publishes_total counter",
      `flagstage_publishes_total ${row.publishes}`,
      "# HELP flagstage_turns_total Change requests created.",
      "# TYPE flagstage_turns_total counter",
      `flagstage_turns_total ${row.turns}`,
      ""
    ].join("\n");
    return new Response(body, {
      headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" }
    });
  } finally {
    await pool.end();
  }
}
