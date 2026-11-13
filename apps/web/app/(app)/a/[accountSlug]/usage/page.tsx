import { eq, inArray } from "drizzle-orm";

import { can } from "@flagstage/core";
import { changeRequest, site } from "@flagstage/db";
import {
  Button,
  Field,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@flagstage/ui";

import { setBudgetAction } from "../../../../../src/actions";
import { database, requireAccount } from "../../../../../src/guard";
import { formatUsd } from "../../../../../src/money";
import { Page } from "../../../../../src/page";
import { friendlyWhen, monthKey } from "../../../../../src/time";

export default async function AccountUsagePage({
  params
}: {
  params: Promise<{ accountSlug: string }>;
}) {
  const { accountSlug } = await params;
  const { principal, account: found } = await requireAccount(accountSlug);
  const db = database();
  const sites = await db.select().from(site).where(eq(site.accountId, found.id));
  const edits =
    sites.length === 0
      ? []
      : await db
          .select()
          .from(changeRequest)
          .where(
            inArray(
              changeRequest.siteId,
              sites.map((item) => item.id)
            )
          );
  const now = new Date();
  const zoneOf = new Map(sites.map((item) => [item.id, item.timeZone || "UTC"]));
  const monthEdits = edits
    .filter((entry) => {
      const zone = zoneOf.get(entry.siteId) || "UTC";
      return monthKey(entry.createdAt, zone) === monthKey(now, zone);
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const spentAmount = monthEdits.reduce((sum, entry) => {
    const usage = entry.usage as { estimatedUsd?: number } | null;
    return sum + (usage?.estimatedUsd ?? 0);
  }, 0);
  const spent = formatUsd(spentAmount);
  const canBudget = can(principal, "org.manage");
  const budget = found.monthlyBudgetUsd;
  return (
    <Page>
      <PageHeader
        title="Usage"
        description="Estimated model cost for this account, against the monthly budget."
      />
      <section className="space-y-4 rounded-xl border border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">This month</h2>
            <p className="mt-1 text-sm" title={spent.title}>
              {budget == null ? `${spent.text} estimated` : `${spent.text} of $${budget} budget`}
            </p>
          </div>
          {canBudget ? (
            <form action={setBudgetAction} className="flex items-end gap-2">
              <input type="hidden" name="accountId" value={found.id} />
              <input type="hidden" name="next" value={`/a/${found.slug}/usage`} />
              <Field
                label="Budget (USD)"
                name="monthlyBudgetUsd"
                type="number"
                min="0"
                step="1"
                defaultValue={budget ?? ""}
                className="w-28"
              />
              <Button type="submit" variant="outline">
                Save
              </Button>
            </form>
          ) : null}
        </div>
        {budget != null && budget > 0 ? (
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="Monthly budget"
            aria-valuemin={0}
            aria-valuemax={budget}
            aria-valuenow={Math.min(budget, spentAmount)}
          >
            <div
              className="h-full bg-primary"
              style={{
                width:
                  spentAmount > 0
                    ? `max(0.75rem, ${Math.min(100, (spentAmount / budget) * 100)}%)`
                    : "0%"
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No budget yet. An admin can set one to compare this month&apos;s estimate.
          </p>
        )}
        {monthEdits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No edits yet this month.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthEdits.map((entry) => {
                const usage = entry.usage as { estimatedUsd?: number } | null;
                const cost = formatUsd(usage?.estimatedUsd ?? 0);
                const owner = sites.find((item) => item.id === entry.siteId);
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">
                      {friendlyWhen(entry.createdAt, owner?.timeZone || "UTC")}
                    </TableCell>
                    <TableCell>{owner?.name}</TableCell>
                    <TableCell title={cost.title}>{cost.text}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </Page>
  );
}
