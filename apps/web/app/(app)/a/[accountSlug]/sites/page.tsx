import { Alert, Badge, EmptyState, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { site, siteDomain, snapshot } from "@flagstage/db";
import { eq, inArray } from "drizzle-orm";

import { database, requireAccount } from "../../../../../src/guard";
import { Hostname } from "../../../../../src/hostname";
import { LocalTime } from "../../../../../src/local-time";
import { NewSiteDialog } from "../../../../../src/new-site-dialog";
import { Page } from "../../../../../src/page";

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
                className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-[var(--wash)] lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,1.2fr)] lg:items-center lg:gap-x-4"
              >
                <span className="min-w-0 truncate font-semibold" title={row.name}>
                  {row.name}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Badge variant={row.status === "live" ? "success" : "default"}>
                    {statusLabel(row.status)}
                  </Badge>
                  {row.draftSnapshotId && row.draftSnapshotId !== row.currentSnapshotId ? (
                    <Badge variant="warning">Draft waiting</Badge>
                  ) : null}
                </span>
                <Hostname
                  value={domain}
                  truncate
                  className="font-mono text-xs text-muted-foreground"
                />
                <span className="min-w-0 text-sm text-muted-foreground">
                  {when ? (
                    <>
                      Published <LocalTime value={when.toISOString()} />
                    </>
                  ) : (
                    "Not published"
                  )}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </Page>
  );
}
