import { createHmac } from "node:crypto";

import { loadConfig } from "@flagstage/config";
import { analyticsEvent, site } from "@flagstage/db";
import { visitorHash } from "@flagstage/analytics";
import { eq } from "drizzle-orm";

import { database } from "../../../src/guard";

export async function POST(request: Request) {
  const config = loadConfig();
  if (!config.ANALYTICS_ENABLED) return new Response(null, { status: 204 });
  const body = (await request.json()) as { site?: string; path?: string; referrer?: string };
  const siteId = body.site ?? "";
  const path = body.path ?? "/";
  if (!siteId || !path.startsWith("/")) return new Response(null, { status: 204 });
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found?.analyticsEnabled) return new Response(null, { status: 204 });
  const ip =
    (request.headers.get("x-forwarded-for") ?? "0.0.0.0").split(",")[0]?.trim() ?? "0.0.0.0";
  const day = new Date().toISOString().slice(0, 10);
  await database()
    .insert(analyticsEvent)
    .values({
      id: crypto.randomUUID(),
      siteId,
      path,
      referrer: body.referrer || null,
      visitorHash: visitorHash(
        createHmac("sha256", config.BETTER_AUTH_SECRET).update("analytics").digest("hex"),
        day,
        ip,
        request.headers.get("user-agent") ?? ""
      )
    });
  return new Response(null, { status: 204 });
}
