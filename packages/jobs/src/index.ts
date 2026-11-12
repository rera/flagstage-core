import { PgBoss } from "pg-boss";

import { QUEUE_NAMES, type QueueName } from "@flagstage/db";

export type ImportJob = {
  siteId: string;
  runId: string;
  sourceUrl: string;
  correlationId: string;
};

export type AgentTurnJob = {
  siteId: string;
  userId: string;
  body: string;
  correlationId: string;
  commentOnly?: boolean;
  userRecorded?: boolean;
  allowHold?: boolean;
};

let started: Promise<PgBoss> | undefined;
let startedUrl: string | undefined;

async function bossFor(databaseUrl: string): Promise<PgBoss> {
  if (started && startedUrl === databaseUrl) return started;
  startedUrl = databaseUrl;
  started = (async () => {
    const boss = new PgBoss(databaseUrl);
    await boss.start();
    for (const name of QUEUE_NAMES) {
      await boss.createQueue(name);
    }
    return boss;
  })();
  return started;
}

export function taskEnvironment(correlationId: string): { CORRELATION_ID: string } {
  return { CORRELATION_ID: correlationId };
}

export async function enqueue(
  databaseUrl: string,
  name: QueueName,
  data: ImportJob | AgentTurnJob
): Promise<string> {
  const boss = await bossFor(databaseUrl);
  const id = await boss.send(name, data);
  if (!id) throw new Error(`Could not queue ${name}.`);
  return id;
}
