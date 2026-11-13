import { Button, EmptyState, Field, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account } from "@flagstage/db";
import { inArray } from "drizzle-orm";

import { createAccountAction } from "../../../src/actions";
import { database, requirePrincipal } from "../../../src/guard";
import { Page } from "../../../src/page";

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
    <Page>
      <PageHeader
        title={t("accounts.title")}
        description={rows.length === 0 ? undefined : "Accounts you belong to."}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={t("accounts.none")}
          description={t("accounts.empty")}
          action={
            can(principal, "org.manage") ? (
              <a href="#create-account" className="text-sm font-medium text-primary">
                {t("accounts.create")}
              </a>
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-card">
          {rows.map((row) => (
            <a
              key={row.id}
              href={`/accounts/${row.id}`}
              className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-[var(--wash)]"
            >
              <span className="font-semibold">{row.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{row.slug}</span>
            </a>
          ))}
        </div>
      )}
      {can(principal, "org.manage") ? (
        <form id="create-account" action={createAccountAction} className="max-w-md space-y-4">
          <h2 className="text-base font-semibold">{t("accounts.create")}</h2>
          <Field label={t("accounts.name")} name="name" required />
          <Button type="submit">{t("accounts.create")}</Button>
        </form>
      ) : null}
    </Page>
  );
}
