import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { eq, sql } from "drizzle-orm";
import { PgBoss, type Job } from "pg-boss";

import { postMessage, buildAgentEnv, skillsDirectory, subprocessRunner } from "@flagstage/agent";
import { rollupStored } from "@flagstage/analytics";
import { createLogger, loadConfig } from "@flagstage/config";
import {
  getDb,
  message,
  migrateWithLock,
  QUEUE_NAMES,
  thread,
  type QueueName
} from "@flagstage/db";
import { publicDnsLookup, recheckDueDomains } from "@flagstage/domains";
import { runImport } from "@flagstage/importer";
import type { AgentTurnJob, ImportJob } from "@flagstage/jobs";
import { createBlobStore } from "@flagstage/storage";

const config = loadConfig();
const log = createLogger(config, "worker");

await migrateWithLock(config.DATABASE_URL);
const boss = new PgBoss(config.DATABASE_URL);
await boss.start();
for (const name of QUEUE_NAMES) {
  await boss.createQueue(name);
}

async function note(name: QueueName, jobs: Job<unknown>[]): Promise<void> {
  log.info({ queue: name, count: jobs.length }, "job received");
}

await boss.work("import", async (jobs) => {
  for (const job of jobs) {
    const data = job.data as ImportJob;
    if (!data.siteId || !data.runId || !data.sourceUrl) continue;
    log.info({ siteId: data.siteId, runId: data.runId }, "import started");
    await runImport({
      db: getDb(config.DATABASE_URL),
      store: createBlobStore(config),
      siteId: data.siteId,
      importRunId: data.runId,
      sourceUrl: data.sourceUrl,
      appOrigin: config.APP_URL,
      caps: {
        maxPages: config.IMPORT_MAX_PAGES,
        maxDepth: config.IMPORT_MAX_DEPTH,
        maxAssets: config.IMPORT_MAX_ASSETS
      }
    });
  }
});
await boss.work("agent-turn", async (jobs) => {
  for (const job of jobs) {
    const data = job.data as AgentTurnJob;
    if (!data.siteId || !data.userId || !data.body) continue;
    const db = getDb(config.DATABASE_URL);
    try {
      await postMessage({
        db,
        store: createBlobStore(config),
        siteId: data.siteId,
        userId: data.userId,
        body: data.body,
        appOrigin: config.APP_URL,
        commentOnly: data.commentOnly,
        userRecorded: data.userRecorded,
        allowHold: data.allowHold,
        runner: config.AI_MOCK
          ? undefined
          : subprocessRunner({
              env: buildAgentEnv(process.env),
              timeoutMs: config.AGENT_TIMEOUT_SEC * 1000,
              skillsDir: skillsDirectory
            })
      });
    } catch (error) {
      log.error({ err: error, siteId: data.siteId }, "agent turn failed");
      const threads = await db.select().from(thread).where(eq(thread.siteId, data.siteId)).limit(1);
      const threadId = threads[0]?.id;
      if (!threadId) continue;
      await db.insert(message).values({
        id: randomUUID(),
        threadId,
        author: "system",
        body: "The change did not finish. Try again."
      });
      await db
        .update(thread)
        .set({ status: "open", updatedAt: new Date() })
        .where(eq(thread.id, threadId));
      try {
        await db.execute(sql`select pg_notify('flagstage_chat', ${threadId})`);
      } catch {
        // The site page also polls.
      }
    }
  }
});
await boss.work("publish", async (jobs) => note("publish", jobs));
await boss.work("dns-check", async (jobs) => note("dns-check", jobs));
await boss.work("analytics-rollup", async () => {
  await rollupStored(getDb(config.DATABASE_URL));
});
await boss.schedule("analytics-rollup", "15 * * * *", {});
await boss.work("domain-recheck", async () => {
  await recheckDueDomains(getDb(config.DATABASE_URL), publicDnsLookup());
});
await boss.schedule("domain-recheck", "*/10 * * * *", {});

const health = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});
health.listen(3001, "0.0.0.0");
log.info("worker listening on :3001");

async function shutdown() {
  health.close();
  await boss.stop({ graceful: true, timeout: 10_000 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
