import { Alert, Badge, EmptyState, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { site, siteDomain, snapshot } from "@flagstage/db";
import { eq, inArray } from "drizzle-orm";

import { database, requireAccount } from "../../../../../src/guard";
import { NewSiteDialog } from "../../../../../src/new-site-dialog";
import { Page } from "../../../../../src/page";
import { friendlyWhen } from "../../../../../src/time";

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "importing") return "Importing";
  if (status === "preview") return "Draft";
  if (status === "failed") return "Didn't finish";
  return status;
}

export default async function AccountSitesPage({
  params,
  searchParams
}: {
  params: Promise<{ accountSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { accountSlug } = await params;
  const { principal, account: found } = await requireAccount(accountSlug);
  const query = await searchParams;
  const db = database();
  const sites = await db.select().from(site).where(eq(site.accountId, found.id));
  const canCreate = can(principal, "site.manage", { accountId: found.id });
  const currentIds = sites
    .map((row) => row.currentSnapshotId)
    .filter((id): id is string => Boolean(id));
  const published =
    currentIds.length === 0
      ? []
      : await db.select().from(snapshot).where(inArray(snapshot.id, currentIds));
  const publishedAt = new Map(published.map((row) => [row.id, row.createdAt]));
  const domains =
    sites.length === 0
      ? []
      : await db
          .select()
          .from(siteDomain)
          .where(
            inArray(
              siteDomain.siteId,
              sites.map((row) => row.id)
            )
          );
  return (
    <Page>
      <PageHeader
        title={t("sites.title")}
        description={sites.length === 0 ? t("sites.lead") : "Sites in this account."}
        actions={
          canCreate ? <NewSiteDialog accounts={[{ id: found.id, name: found.name }]} /> : undefined
        }
      />
      {query.error ? <Alert variant="destructive">{t("sites.failed")}</Alert> : null}
      {sites.length === 0 ? (
        <EmptyState
          title={t("sites.none")}
          description={
            canCreate ? t("sites.lead") : "Sites imported for this account show up here."
          }
        />
      ) : (
        <div className="grid gap-3">
          {sites.map((row) => {
            const domain =
              domains.find((item) => item.siteId === row.id)?.hostname ?? `${row.slug}.localhost`;
            const when = row.currentSnapshotId ? publishedAt.get(row.currentSnapshotId) : undefined;
            return (
              <a
                key={row.id}
                href={`/a/${found.slug}/sites/${row.id}`}
                className="grid gap-3 rounded-xl border border-border bg-card px-5 py-4 hover:bg-[var(--wash)] sm:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
              >
                <span className="block font-semibold">{row.name}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={row.status === "live" ? "success" : "default"}>
                    {statusLabel(row.status)}
                  </Badge>
                  {row.draftSnapshotId && row.draftSnapshotId !== row.currentSnapshotId ? (
                    <Badge variant="warning">Draft waiting</Badge>
                  ) : null}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">{domain}</span>
                <span className="text-sm text-muted-foreground">
                  {when
                    ? `Published ${friendlyWhen(when, row.timeZone || "UTC")}`
                    : "Not published"}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </Page>
  );
}
