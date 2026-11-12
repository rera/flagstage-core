import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import { Alert, Badge, Button, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account, changeRequest, site, user } from "@flagstage/db";

import { setBudgetAction, setOrgRoleAction } from "../../src/actions";
import { database, requirePrincipal } from "../../src/guard";

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
    <>
      <PageHeader title={t("admin.title")} description={t("admin.lead")} />
      <p>
        {product
          ? `Bedrock ${product.bedrockModelId} in ${product.region}. The task role calls it.`
          : "Bedrock is not configured."}
      </p>
      {params.error === "self" ? <Alert tone="bad">{t("admin.last")}</Alert> : null}
      <table className="data">
        <thead>
          <tr>
            <th>{t("members.person")}</th>
            <th>{t("members.role")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const admin = person.org_role === "admin";
            return (
              <tr key={person.id}>
                <td>{person.email}</td>
                <td>{admin ? <Badge>{t("roles.admin")}</Badge> : null}</td>
                <td>
                  <form action={setOrgRoleAction}>
                    <input type="hidden" name="userId" value={person.id} />
                    <input type="hidden" name="role" value={admin ? "none" : "admin"} />
                    <Button type="submit" variant="quiet">
                      {admin ? t("admin.demote") : t("admin.promote")}
                    </Button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>{t("usage.title")}</h2>
      <p>{t("usage.lead")}</p>
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
          <section key={item.id}>
            <h3>{item.name}</h3>
            {over ? <Alert tone="bad">{t("usage.over")}</Alert> : null}
            <form action={setBudgetAction}>
              <input type="hidden" name="accountId" value={item.id} />
              <label className="field" htmlFor={`budget-${item.id}`}>
                <span>{t("usage.budget")}</span>
                <input
                  id={`budget-${item.id}`}
                  name="monthlyBudgetUsd"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={item.monthlyBudgetUsd ?? ""}
                />
              </label>
              <Button type="submit" variant="quiet">
                {t("usage.save")}
              </Button>
            </form>
            <table className="data">
              <tbody>
                {rows.map((entry) => {
                  const usage = entry.usage as {
                    inputTokens?: number;
                    outputTokens?: number;
                    estimatedUsd?: number;
                  } | null;
                  const owner = owned.find((ownedSite) => ownedSite.id === entry.siteId);
                  return (
                    <tr key={entry.id}>
                      <td>{owner?.name}</td>
                      <td>{usage?.inputTokens ?? 0}</td>
                      <td>{usage?.outputTokens ?? 0}</td>
                      <td>{(usage?.estimatedUsd ?? 0).toFixed(6)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
