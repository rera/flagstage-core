import Link from "next/link";

import { Button, EmptyState, PageHeader, TextField, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account } from "@flagstage/db";
import { inArray } from "drizzle-orm";

import { createAccountAction } from "../../src/actions";
import { database, requirePrincipal } from "../../src/guard";

export default async function AccountsPage() {
  const principal = await requirePrincipal();
  const db = database();
  const rows = can(principal, "org.manage")
    ? await db.select().from(account)
    : await db
        .select()
        .from(account)
        .where(
          inArray(
            account.id,
            principal.memberships.map((membership) => membership.accountId)
          )
        );
  return (
    <>
      <PageHeader
        title={t("accounts.title")}
        description={rows.length === 0 ? undefined : t("accounts.empty")}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={t("accounts.none")}
          description={t("accounts.empty")}
          action={
            can(principal, "org.manage") ? (
              <a href="#create-account">{t("accounts.create")}</a>
            ) : undefined
          }
        />
      ) : (
        <table className="data">
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/accounts/${row.id}`}>{row.name}</Link>
                </td>
                <td className="mono">{row.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {can(principal, "org.manage") ? (
        <form id="create-account" action={createAccountAction} className="narrow">
          <h2>{t("accounts.create")}</h2>
          <TextField label={t("accounts.name")} name="name" required />
          <Button type="submit">{t("accounts.create")}</Button>
        </form>
      ) : null}
    </>
  );
}
