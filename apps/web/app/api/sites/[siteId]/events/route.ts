import { eq } from "drizzle-orm";
import pg from "pg";

import { can } from "@flagstage/core";
import { loadConfig } from "@flagstage/config";
import { importRun, message, site, thread } from "@flagstage/db";

import { database, requirePrincipal } from "../../../../../src/guard";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params;
  const principal = await requirePrincipal();
  const db = database();
  const sites = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = sites[0];
  if (!found || !can(principal, "site.read", { accountId: found.accountId })) {
    return new Response("Not found", { status: 404 });
  }
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      const send = async () => {
        if (closed) return;
        const current = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
        const threads = await db.select().from(thread).where(eq(thread.siteId, siteId)).limit(1);
        const threadId = threads[0]?.id;
        const rows = threadId
          ? await db
              .select({ id: message.id, body: message.body })
              .from(message)
              .where(eq(message.threadId, threadId))
          : [];
        const runs = await db
          .select({ status: importRun.status })
          .from(importRun)
          .where(eq(importRun.siteId, siteId));
        const payload = JSON.stringify({
          messages: rows,
          siteStatus: current[0]?.status ?? null,
          threadStatus: threads[0]?.status ?? null,
          importStatus: runs.at(-1)?.status ?? null
        });
        if (payload === last) return;
        last = payload;
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };
      const timer = setInterval(() => void send().catch(() => undefined), 2000);
      let client: pg.Client | undefined;
      try {
        client = new pg.Client({ connectionString: loadConfig().DATABASE_URL });
        await client.connect();
        await client.query("LISTEN flagstage_chat");
        client.on("notification", () => void send().catch(() => undefined));
      } catch {
        client = undefined;
      }
      await send();
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        void client?.end();
        try {
          controller.close();
        } catch {
          // The client already hung up.
        }
      };
      setTimeout(close, 60_000);
    }
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache"
    }
  });
}
