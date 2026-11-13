import { can } from "@flagstage/core";
import { account, changeRequest, membership, site } from "@flagstage/db";
import { EmptyState, PageHeader, t } from "@flagstage/ui";
import { inArray } from "drizzle-orm";

import { database, requirePrincipal } from "../../../src/guard";
import { formatUsd } from "../../../src/money";
import { NewAccountDialog } from "../../../src/new-account-dialog";
import { Page } from "../../../src/page";
import { monthKey } from "../../../src/time";

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
  const ids = rows.map((row) => row.id);
  const sites =
    ids.length === 0 ? [] : await db.select().from(site).where(inArray(site.accountId, ids));
  const members =
    ids.length === 0
      ? []
      : await db.select().from(membership).where(inArray(membership.accountId, ids));
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
  return (
    <Page>
      <PageHeader
        title={t("accounts.title")}
        description={rows.length === 0 ? t("accounts.empty") : "Accounts you belong to."}
        actions={can(principal, "org.manage") ? <NewAccountDialog /> : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState title={t("accounts.none")} description={t("accounts.empty")} />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const owned = sites.filter((item) => item.accountId === row.id);
            const people = members.filter((item) => item.accountId === row.id).length;
            const cost = formatUsd(
              edits.reduce((sum, entry) => {
                const owner = owned.find((item) => item.id === entry.siteId);
                if (!owner) return sum;
                const zone = owner.timeZone || "UTC";
                if (monthKey(entry.createdAt, zone) !== monthKey(now, zone)) return sum;
                const usage = entry.usage as { estimatedUsd?: number } | null;
                return sum + (usage?.estimatedUsd ?? 0);
              }, 0)
            );
            return (
              <a
                key={row.id}
                href={`/accounts/${row.id}`}
                className="grid gap-4 rounded-xl border border-border bg-card px-5 py-4 hover:bg-[var(--wash)] sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] sm:items-center"
              >
                <span>
                  <span className="block font-semibold">{row.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{row.slug}</span>
                </span>
                <span className="text-sm">
                  <span className="block text-muted-foreground">Sites</span>
                  <span className="font-medium">{owned.length}</span>
                </span>
                <span className="text-sm">
                  <span className="block text-muted-foreground">People</span>
                  <span className="font-medium">{people}</span>
                </span>
                <span className="text-sm" title={cost.title}>
                  <span className="block text-muted-foreground">This month</span>
                  <span className="font-medium">{cost.text}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </Page>
  );
}
