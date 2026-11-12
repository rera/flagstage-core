import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import {
  Alert,
  Badge,
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
import { account, changeRequest, site, user } from "@flagstage/db";

import { setBudgetAction, setOrgRoleAction } from "../../../src/actions";
import { database, requirePrincipal } from "../../../src/guard";
import { Page } from "../../../src/page";

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const params = await searchParams;
  let product: ReturnType<typeof loadConfig>["product"];
  try {
    product = loadConfig().product;
  } catch {
    product = undefined;
  }
  const db = database();
  const people = await db.select().from(user).orderBy(user.email);
  const accounts = await db.select().from(account);
  const sites = await db.select().from(site);
  const edits = await db.select().from(changeRequest);
  return (
    <Page>
      <PageHeader title={t("admin.title")} description={t("admin.lead")} />
      <p className="text-sm text-muted-foreground">
        {product
          ? `Bedrock ${product.bedrockModelId} in ${product.region}. The task role calls it.`
          : "Bedrock is not configured."}
      </p>
      {params.error === "self" ? <Alert variant="destructive">{t("admin.last")}</Alert> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("members.person")}</TableHead>
            <TableHead>{t("members.role")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person) => {
            const admin = person.org_role === "admin";
            return (
              <TableRow key={person.id}>
                <TableCell>{person.email}</TableCell>
                <TableCell>{admin ? <Badge>{t("roles.admin")}</Badge> : null}</TableCell>
                <TableCell>
                  <form action={setOrgRoleAction}>
                    <input type="hidden" name="userId" value={person.id} />
                    <input type="hidden" name="role" value={admin ? "none" : "admin"} />
                    <Button type="submit" variant="outline" size="sm">
                      {admin ? t("admin.demote") : t("admin.promote")}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <h2 className="text-base font-semibold">{t("usage.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("usage.lead")}</p>
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
            <h3 className="text-sm font-semibold">{item.name}</h3>
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
                      <TableCell className="font-mono text-xs">
                        {usage?.outputTokens ?? 0}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {(usage?.estimatedUsd ?? 0).toFixed(6)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        );
      })}
    </Page>
  );
}
