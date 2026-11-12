import { redirect } from "next/navigation";

import {
  Alert,
  Button,
  Field,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  t
} from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account, changeRequest, site } from "@flagstage/db";

import { setBudgetAction } from "../../../../src/actions";
import { database, requirePrincipal } from "../../../../src/guard";
import { Page } from "../../../../src/page";

export default async function UsagePage() {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const db = database();
  const accounts = await db.select().from(account);
  const sites = await db.select().from(site);
  const edits = await db.select().from(changeRequest);
  return (
    <Page>
      <PageHeader
        title={t("usage.title")}
        description={t("usage.lead")}
        actions={
          <a href="/admin" className="text-sm font-medium text-primary">
            {t("admin.title")}
          </a>
        }
      />
      {accounts.map((item) => {
        const owned = sites.filter((entry) => entry.accountId === item.id);
        const rows = edits.filter((entry) =>
          owned.some((ownedSite) => ownedSite.id === entry.siteId)
        );
        const month = new Date().toISOString().slice(0, 7);
        const spent = rows.reduce((sum, entry) => {
          if (entry.createdAt.toISOString().slice(0, 7) !== month) return sum;
          const usage = entry.usage as { estimatedUsd?: number } | null;
          return sum + (usage?.estimatedUsd ?? 0);
        }, 0);
        const over = item.monthlyBudgetUsd != null && spent >= item.monthlyBudgetUsd;
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
              <p className="text-sm text-muted-foreground">No edits recorded for this account.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead>USD</TableHead>
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
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>{owner?.name}</TableCell>
                        <TableCell className="font-mono text-xs">{usage?.inputTokens ?? 0}</TableCell>
                        <TableCell className="font-mono text-xs">{usage?.outputTokens ?? 0}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {(usage?.estimatedUsd ?? 0).toFixed(6)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        );
      })}
    </Page>
  );
}
