import {
  Alert,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  t
} from "@flagstage/ui";
import { account, changeRequest, site } from "@flagstage/db";

import { AdminPage } from "../../../../src/admin-page";
import { database } from "../../../../src/guard";
import { formatUsd } from "../../../../src/money";
import { friendlyWhen, monthKey } from "../../../../src/time";

export default async function UsagePage() {
  const db = database();
  const accounts = await db.select().from(account);
  const sites = await db.select().from(site);
  const edits = await db.select().from(changeRequest);
  const now = new Date();
  const zoneOf = new Map(sites.map((item) => [item.id, item.timeZone || "UTC"]));
  const monthEdits = edits.filter((entry) => {
    const zone = zoneOf.get(entry.siteId) || "UTC";
    return monthKey(entry.createdAt, zone) === monthKey(now, zone);
  });
  const spent = formatUsd(
    monthEdits.reduce((sum, entry) => {
      const usage = entry.usage as { estimatedUsd?: number } | null;
      return sum + (usage?.estimatedUsd ?? 0);
    }, 0)
  );
  return (
    <AdminPage
      title="Usage"
      description="Estimated model cost for every account. Set a budget on the account page."
      stats={[
        { label: "Edits this month", value: String(monthEdits.length) },
        { label: "Estimated cost", value: spent.text, title: spent.title }
      ]}
    >
      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Budgets and edit costs show up after an account exists."
        />
      ) : (
        accounts.map((item) => {
          const owned = sites.filter((entry) => entry.accountId === item.id);
          const rows = edits
            .filter((entry) => owned.some((ownedSite) => ownedSite.id === entry.siteId))
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
          const accountSpent = rows.reduce((sum, entry) => {
            const zone = zoneOf.get(entry.siteId) || "UTC";
            if (monthKey(entry.createdAt, zone) !== monthKey(now, zone)) return sum;
            const usage = entry.usage as { estimatedUsd?: number } | null;
            return sum + (usage?.estimatedUsd ?? 0);
          }, 0);
          const over = item.monthlyBudgetUsd != null && accountSpent >= item.monthlyBudgetUsd;
          return (
            <section key={item.id} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">
                  <a href={`/accounts/${item.id}`} className="hover:underline">
                    {item.name}
                  </a>
                </h2>
                <a href={`/accounts/${item.id}`} className="text-sm font-medium text-primary">
                  Account
                </a>
              </div>
              {over ? <Alert variant="destructive">{t("usage.over")}</Alert> : null}
              {rows.length === 0 ? (
                <EmptyState
                  title="No edits yet"
                  description="Chat edits and scheduled publishes show up in this log."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>In</TableHead>
                      <TableHead>Out</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((entry) => {
                      const usage = entry.usage as {
                        inputTokens?: number;
                        outputTokens?: number;
                        estimatedUsd?: number;
                      } | null;
                      const owner = owned.find((ownedSite) => ownedSite.id === entry.siteId);
                      const cost = formatUsd(usage?.estimatedUsd ?? 0);
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="text-muted-foreground">
                            {friendlyWhen(entry.createdAt, owner?.timeZone || "UTC")}
                          </TableCell>
                          <TableCell>{owner?.name}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {usage?.inputTokens ?? 0}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {usage?.outputTokens ?? 0}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums" title={cost.title}>
                            {cost.text}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </section>
          );
        })
      )}
    </AdminPage>
  );
}
