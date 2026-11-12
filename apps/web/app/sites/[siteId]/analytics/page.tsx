import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { topPages, visitsInRange } from "@flagstage/analytics";
import { can } from "@flagstage/core";
import { analyticsDaily, analyticsEvent, site } from "@flagstage/db";
import { EmptyState, PageHeader, t, type MessageKey } from "@flagstage/ui";

import { database, requirePrincipal } from "../../../../src/guard";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const RANGE_LABEL: Record<Range, MessageKey> = {
  7: "analytics.days7",
  30: "analytics.days30",
  90: "analytics.days90"
};

function rangeOf(value: string | undefined): Range {
  const parsed = Number(value);
  return RANGES.find((days) => days === parsed) ?? 30;
}

export default async function AnalyticsPage({
  params,
  searchParams
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { siteId } = await params;
  const query = await searchParams;
  const days = rangeOf(query.days);
  const principal = await requirePrincipal();
  const db = database();
  const sites = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = sites[0];
  if (!found || !can(principal, "site.read", { accountId: found.accountId })) notFound();
  const daily = await db.select().from(analyticsDaily).where(eq(analyticsDaily.siteId, siteId));
  const recent = await db.select().from(analyticsEvent).where(eq(analyticsEvent.siteId, siteId));
  const rows = visitsInRange(
    daily,
    recent.map((event) => ({
      siteId: event.siteId,
      path: event.path,
      referrer: event.referrer,
      visitorHash: event.visitorHash,
      createdAt: event.createdAt
    })),
    new Date(),
    days
  );
  const pageviews = rows.reduce((sum, row) => sum + row.pageviews, 0);
  const visitors = rows.reduce((sum, row) => sum + row.visitors, 0);
  const pages = topPages(rows);
  return (
    <>
      <PageHeader title={t("analytics.title")} description={found.name} />
      <nav className="nav" aria-label={t("analytics.range")}>
        {RANGES.map((item) => (
          <a
            key={item}
            href={`/sites/${siteId}/analytics?days=${item}`}
            aria-current={item === days ? "page" : undefined}
          >
            {t(RANGE_LABEL[item])}
          </a>
        ))}
      </nav>
      <p>
        {t("analytics.pageviews")}: {pageviews}. {t("analytics.visitors")}: {visitors}.{" "}
        {t("analytics.note")}
      </p>
      <h2>{t("analytics.topPages")}</h2>
      {pages.length === 0 ? (
        <EmptyState
          title={t("analytics.empty")}
          description={t("analytics.emptyBody")}
          action={<a href={`/sites/${siteId}`}>{t("analytics.openSite")}</a>}
        />
      ) : (
        <table className="data">
          <tbody>
            {pages.map((page) => (
              <tr key={page.path}>
                <td className="mono">{page.path}</td>
                <td>{page.pageviews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
