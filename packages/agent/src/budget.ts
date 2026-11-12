import { eq } from "drizzle-orm";

import { account, changeRequest, site, type Database } from "@flagstage/db";

export async function maybeAlertBudget(db: Database, accountId: string): Promise<void> {
  const topic = process.env.BUDGET_TOPIC_ARN;
  if (!topic) return;
  const accounts = await db.select().from(account).where(eq(account.id, accountId)).limit(1);
  const budget = accounts[0]?.monthlyBudgetUsd;
  if (!budget || budget <= 0) return;
  const month = new Date().toISOString().slice(0, 7);
  if (accounts[0]?.budgetAlertMonth === month) return;
  const sites = await db.select().from(site).where(eq(site.accountId, accountId));
  const siteIds = new Set(sites.map((item) => item.id));
  const requests = await db.select().from(changeRequest);
  let spent = 0;
  for (const request of requests) {
    if (!siteIds.has(request.siteId)) continue;
    if (request.createdAt.toISOString().slice(0, 7) !== month) continue;
    const usage = request.usage as { estimatedUsd?: number } | null;
    spent += usage?.estimatedUsd ?? 0;
  }
  if (spent < budget) return;
  const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns");
  await new SNSClient({}).send(
    new PublishCommand({
      TopicArn: topic,
      Subject: "Bedrock budget",
      Message: `Account ${accountId} passed its monthly Bedrock budget of ${budget} USD. Estimated spend is ${spent.toFixed(4)} USD.`
    })
  );
  await db.update(account).set({ budgetAlertMonth: month }).where(eq(account.id, accountId));
}
