import { createServer } from "node:http";

import { postMessage, buildAgentEnv, skillsDirectory, subprocessRunner } from "@flagstage/agent";
import { createLogger, loadConfig } from "@flagstage/config";
import { getDb, migrateWithLock, QUEUE_NAMES, type QueueName } from "@flagstage/db";
import { createBlobStore } from "@flagstage/storage";
import { PgBoss, type Job } from "pg-boss";

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

await boss.work("import", async (jobs) => note("import", jobs));
await boss.work("agent-turn", async (jobs) => {
  for (const job of jobs) {
    const data = job.data as { siteId?: string; userId?: string; body?: string };
    if (!data.siteId || !data.userId || !data.body) continue;
    await postMessage({
      db: getDb(config.DATABASE_URL),
      store: createBlobStore(config),
      siteId: data.siteId,
      userId: data.userId,
      body: data.body,
      appOrigin: config.APP_URL,
      runner: config.AI_MOCK
        ? undefined
        : subprocessRunner({
            env: buildAgentEnv(process.env),
            timeoutMs: config.AGENT_TIMEOUT_SEC * 1000,
            skillsDir: skillsDirectory
          })
    });
  }
});
await boss.work("publish", async (jobs) => note("publish", jobs));
await boss.work("dns-check", async (jobs) => note("dns-check", jobs));
await boss.work("analytics-rollup", async (jobs) => note("analytics-rollup", jobs));
await boss.work("domain-recheck", async (jobs) => note("domain-recheck", jobs));

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
