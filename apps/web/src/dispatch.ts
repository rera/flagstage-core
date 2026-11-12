import { buildAgentEnv, postMessage, skillsDirectory, subprocessRunner } from "@flagstage/agent";
import { loadConfig } from "@flagstage/config";
import { getDb } from "@flagstage/db";
import { runImport } from "@flagstage/importer";
import { createBlobStore } from "@flagstage/storage";

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
    timeoutMs: Math.min(config.AGENT_TIMEOUT_SEC * 1000, 14 * 60 * 1000),
    skillsDir: skillsDirectory
  });
}

export async function startImport(job: { siteId: string; runId: string; sourceUrl: string }) {
  const cluster = process.env.ECS_CLUSTER;
  const taskDefinition = process.env.IMPORT_TASK_DEFINITION;
  if (cluster && taskDefinition) {
    const { ECSClient, RunTaskCommand } = await import("@aws-sdk/client-ecs");
    const subnets = (process.env.IMPORT_SUBNETS ?? "").split(",").filter(Boolean);
    const securityGroups = (process.env.IMPORT_SECURITY_GROUPS ?? "").split(",").filter(Boolean);
    await new ECSClient({}).send(
      new RunTaskCommand({
        cluster,
        taskDefinition,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: { subnets, securityGroups, assignPublicIp: "ENABLED" }
        },
        overrides: {
          containerOverrides: [
            {
              name: "import",
              environment: [
                { name: "IMPORT_SITE_ID", value: job.siteId },
                { name: "IMPORT_RUN_ID", value: job.runId },
                { name: "SOURCE_URL", value: job.sourceUrl }
              ]
            }
          ]
        }
      })
    );
    return;
  }
  const config = loadConfig();
  void runImport({
    db: getDb(config.DATABASE_URL),
    store: createBlobStore(config),
    siteId: job.siteId,
    importRunId: job.runId,
    sourceUrl: job.sourceUrl,
    appOrigin: config.APP_URL,
    caps: {
      maxPages: config.IMPORT_MAX_PAGES,
      maxDepth: config.IMPORT_MAX_DEPTH,
      maxAssets: config.IMPORT_MAX_ASSETS
    }
  }).catch(() => undefined);
}

export async function startTurn(job: {
  siteId: string;
  userId: string;
  body: string;
  continuation?: boolean;
}) {
  const functionName = process.env.LAMBDA_FUNCTION_NAME;
  if (functionName) {
    const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
    await new LambdaClient({}).send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify(job))
      })
    );
    return;
  }
  const config = loadConfig();
  void postMessage({
    db: getDb(config.DATABASE_URL),
    store: createBlobStore(config),
    siteId: job.siteId,
    userId: job.userId,
    body: job.body,
    appOrigin: config.APP_URL,
    userRecorded: true,
    continuation: job.continuation,
    deadlineMs: Date.now() + 14 * 60 * 1000,
    runner: editor()
  })
    .then((result) => {
      if (result.continue) return startTurn({ ...job, continuation: true });
      return undefined;
    })
    .catch(() => undefined);
}
