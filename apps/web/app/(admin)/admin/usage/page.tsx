import {
  Alert,
  Button,
  EmptyState,
  Field,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  t
} from "@flagstage/ui";
import { account, changeRequest, site } from "@flagstage/db";

import { setBudgetAction } from "../../../../src/actions";
import { AdminPage } from "../../../../src/admin-page";
import { database } from "../../../../src/guard";
import { formatUsd } from "../../../../src/money";
import { friendlyWhen } from "../../../../src/time";

export default async function UsagePage() {
  const db = database();
  const accounts = await db.select().from(account);
  const sites = await db.select().from(site);
  const edits = await db.select().from(changeRequest);
  const month = new Date().toISOString().slice(0, 7);
  const monthEdits = edits.filter((entry) => entry.createdAt.toISOString().slice(0, 7) === month);
  const spent = formatUsd(
    monthEdits.reduce((sum, entry) => {
      const usage = entry.usage as { estimatedUsd?: number } | null;
      return sum + (usage?.estimatedUsd ?? 0);
    }, 0)
  );
  return (
    <AdminPage
      title="Usage"
      description="Token counts and estimated Bedrock cost for each edit, plus the monthly budget."
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
          const rows = edits.filter((entry) =>
            owned.some((ownedSite) => ownedSite.id === entry.siteId)
          );
          const accountSpent = rows.reduce((sum, entry) => {
            if (entry.createdAt.toISOString().slice(0, 7) !== month) return sum;
            const usage = entry.usage as { estimatedUsd?: number } | null;
            return sum + (usage?.estimatedUsd ?? 0);
          }, 0);
          const over = item.monthlyBudgetUsd != null && accountSpent >= item.monthlyBudgetUsd;
          return (
            <section key={item.id} className="space-y-3">
              <h2 className="text-base font-semibold">{item.name}</h2>
              {over ? <Alert variant="destructive">{t("usage.over")}</Alert> : null}
              <form action={setBudgetAction} className="max-w-xs space-y-3">
                <input type="hidden" name="accountId" value={item.id} />
                <Field
                  id={`budget-${item.id}`}
                  label={t("usage.budget")}
                  name="monthlyBudgetUsd"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={item.monthlyBudgetUsd ?? ""}
                />
                <Button type="submit" variant="outline">
                  {t("usage.save")}
                </Button>
              </form>
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
                            {friendlyWhen(entry.createdAt)}
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
