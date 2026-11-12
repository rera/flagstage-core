import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { rollupVisits } from "@flagstage/analytics";
import { can } from "@flagstage/core";
import { analyticsDaily, analyticsEvent, site } from "@flagstage/db";
import { PageHeader, t } from "@flagstage/ui";

import { database, requirePrincipal } from "../../../../src/guard";

export default async function AnalyticsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const principal = await requirePrincipal();
  const db = database();
  const sites = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = sites[0];
  if (!found || !can(principal, "site.read", { accountId: found.accountId })) notFound();
  const daily = await db.select().from(analyticsDaily).where(eq(analyticsDaily.siteId, siteId));
  const recent = await db.select().from(analyticsEvent).where(eq(analyticsEvent.siteId, siteId));
  const rows =
    daily.length > 0
      ? daily
      : rollupVisits(
          recent.map((event) => ({
            siteId: event.siteId,
            path: event.path,
            referrer: event.referrer,
            visitorHash: event.visitorHash,
            createdAt: event.createdAt
          }))
        );
  const pageviews = rows.reduce((sum, row) => sum + row.pageviews, 0);
  const visitors = rows.reduce((sum, row) => sum + row.visitors, 0);
  return (
    <>
      <PageHeader title={t("analytics.title")} description={found.name} />
      <p>
        {pageviews} pageviews, {visitors} visitors. No cookies.
      </p>
      <ul>
        {rows.map((row) => (
          <li key={`${row.day ?? "recent"}-${row.path}`}>
            {row.path}: {row.pageviews}
          </li>
        ))}
      </ul>
    </>
  );
}
