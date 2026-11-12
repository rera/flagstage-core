import { Alert, Button, EmptyState, Field, Label, PageHeader, fieldClass, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account, site } from "@flagstage/db";
import { inArray } from "drizzle-orm";

import { importSiteAction } from "../../../src/actions";
import { TimeZoneInput } from "../../../src/time-zone-input";
import { database, requirePrincipal } from "../../../src/guard";
import { Page } from "../../../src/page";

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "importing") return "Importing";
  if (status === "preview") return "Ready to publish";
  if (status === "failed") return "Didn't finish";
  return status;
}

function dot(status: string) {
  if (status === "live") return "bg-[var(--done)]";
  if (status === "failed") return "bg-destructive";
  if (status === "importing" || status === "preview") return "bg-[var(--prog)]";
  return "bg-muted-foreground";
}

export default async function SitesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await requirePrincipal();
  const params = await searchParams;
  const db = database();
  const accounts = can(principal, "org.manage")
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
  const accountIds = accounts.map((row) => row.id);
  const sites =
    accountIds.length === 0
      ? []
      : await db.select().from(site).where(inArray(site.accountId, accountIds));
  const manageable = accounts.filter((row) => can(principal, "site.manage", { accountId: row.id }));
  return (
    <Page>
      <PageHeader
        title={t("sites.title")}
        description={sites.length === 0 ? undefined : t("sites.lead")}
      />
      {params.error ? <Alert variant="destructive">{t("sites.failed")}</Alert> : null}
      {sites.length === 0 ? (
        <EmptyState
          title={t("sites.none")}
          description={t("sites.lead")}
          action={
            manageable.length > 0 ? (
              <a href="#import-site" className="text-sm font-medium text-primary">
                {t("sites.import")}
              </a>
            ) : (
              <a href="/accounts" className="text-sm font-medium text-primary">
                {t("accounts.create")}
              </a>
            )
          }
        />
      ) : (
        <div className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-card">
          {sites.map((row) => (
            <a
              key={row.id}
              href={`/sites/${row.id}`}
              className="flex items-center gap-3 px-4 py-4 hover:bg-[var(--wash)]"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-[#111620] text-sm font-semibold text-white">
                {row.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{row.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span className={`size-1.5 rounded-full ${dot(row.status)}`} aria-hidden />
                  {statusLabel(row.status)}
                  <span className="font-mono">· {row.slug}.localhost</span>
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
      {manageable.length > 0 ? (
        <form id="import-site" action={importSiteAction} className="max-w-md space-y-4">
          <h2 className="text-base font-semibold">{t("sites.import")}</h2>
          <TimeZoneInput />
          <Field label={t("sites.name")} name="name" required />
          <Field label={t("sites.url")} name="sourceUrl" type="url" required />
          <div className="space-y-2">
            <Label htmlFor="accountId">{t("sites.account")}</Label>
            <select id="accountId" name="accountId" required className={fieldClass}>
              {manageable.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">{t("sites.import")}</Button>
        </form>
      ) : null}
    </Page>
  );
}
