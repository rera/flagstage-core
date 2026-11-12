import { buildAgentEnv, postMessage, skillsDirectory, subprocessRunner } from "@flagstage/agent";
import { loadConfig } from "@flagstage/config";
import { getDb } from "@flagstage/db";
import { createBlobStore } from "@flagstage/storage";

export type TurnEvent = {
  siteId: string;
  userId: string;
  body: string;
  continuation?: boolean;
};

function editor() {
  const config = loadConfig();
  const region = process.env.AWS_REGION ?? config.product?.region ?? config.S3_REGION;
  return subprocessRunner({
    env: buildAgentEnv({
      ...process.env,
      AWS_REGION: region,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? region,
      AGENT_MODEL: config.AGENT_MODEL,
      AI_MODEL_SMALL: config.AI_MODEL_SMALL
    }),
    timeoutMs: 14 * 60 * 1000,
    skillsDir: skillsDirectory
  });
}

export async function handler(event: TurnEvent & { scheduleId?: string; action?: string }) {
  if (event.scheduleId) {
    const { publishScheduled, revertScheduled, syncScheduleHost } = await import(
      "@flagstage/publish"
    );
    const config = loadConfig();
    const db = getDb(config.DATABASE_URL);
    const now = new Date();
    const status =
      event.action === "revert"
        ? await revertScheduled(db, event.scheduleId, now)
        : await publishScheduled(db, event.scheduleId, now);
    if (status === "published" || status === "reverted") {
      await syncScheduleHost(db, event.scheduleId);
    }
    return { status };
  }
  const config = loadConfig();
  const result = await postMessage({
    db: getDb(config.DATABASE_URL),
    store: createBlobStore(config),
    siteId: event.siteId,
    userId: event.userId,
    body: event.body,
    appOrigin: config.APP_URL,
    userRecorded: true,
    continuation: event.continuation,
    deadlineMs: Date.now() + 14 * 60 * 1000,
    runner: editor()
  });
  if (result.continue && process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
    await new LambdaClient({}).send(
      new InvokeCommand({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ ...event, continuation: true }))
      })
    );
  }
  return { continue: Boolean(result.continue) };
}
