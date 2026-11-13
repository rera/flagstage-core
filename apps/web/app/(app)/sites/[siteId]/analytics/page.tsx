import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { pageviewsByDay, topPages, visitsInRange } from "@flagstage/analytics";
import { can } from "@flagstage/core";
import { analyticsDaily, analyticsEvent, site } from "@flagstage/db";
import {
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableRow,
  t,
  type MessageKey
} from "@flagstage/ui";

import { database, requirePrincipal } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { SiteIdentity, SiteNav } from "../../../../../src/site-nav";

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
  const series = pageviewsByDay(daily, recent, new Date(), days);
  const peak = Math.max(1, ...series.map((item) => item.pageviews));
  return (
    <Page>
      <div className="space-y-4">
        <SiteIdentity
          siteId={found.id}
          name={found.name}
          status={found.status}
          host={`${found.slug}.localhost`}
        />
        <SiteNav siteId={found.id} current="analytics" />
      </div>
      <PageHeader level={2} title={t("analytics.title")} description="Page views for the selected range." />
      <nav className="flex gap-2" aria-label={t("analytics.range")}>
        {RANGES.map((item) => (
          <a
            key={item}
            href={`/sites/${siteId}/analytics?days=${item}`}
            aria-current={item === days ? "page" : undefined}
            className={
              item === days
                ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
                : "rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
            }
          >
            {t(RANGE_LABEL[item])}
          </a>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        {t("analytics.pageviews")}: {pageviews}. {t("analytics.visitors")}: {visitors}.{" "}
        {t("analytics.note")}
      </p>
      {pages.length === 0 ? null : (
        <svg
          className="h-32 w-full"
          role="img"
          aria-label={t("analytics.chart")}
          viewBox="0 0 640 120"
        >
          <title>{t("analytics.chart")}</title>
          {series.map((item, index) => {
            const slot = 640 / series.length;
            const barHeight = (item.pageviews / peak) * 112;
            return (
              <rect
                key={item.day}
                x={index * slot + 1}
                y={116 - barHeight}
                width={Math.max(slot - 2, 1)}
                height={barHeight}
                fill="var(--chart-1)"
              >
                <title>
                  {item.day}: {item.pageviews}
                </title>
              </rect>
            );
          })}
        </svg>
      )}
      <h2 className="text-base font-semibold">{t("analytics.topPages")}</h2>
      {pages.length === 0 ? (
        <EmptyState
          title={t("analytics.empty")}
          description={t("analytics.emptyBody")}
          action={
            <a href={`/sites/${siteId}`} className="text-sm font-medium text-primary">
              {t("analytics.openSite")}
            </a>
          }
        />
      ) : (
        <Table>
          <TableBody>
            {pages.map((page) => (
              <TableRow key={page.path}>
                <TableCell className="font-mono text-xs">{page.path}</TableCell>
                <TableCell>{page.pageviews}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Page>
  );
}
