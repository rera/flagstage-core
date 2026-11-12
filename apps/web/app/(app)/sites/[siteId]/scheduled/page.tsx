import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Button, EmptyState, PageHeader } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { site, siteSchedule } from "@flagstage/db";
import { describeSchedule, runDueSchedules, syncScheduleHost } from "@flagstage/publish";
import { zoneTitle } from "@flagstage/publish/when";

import { cancelScheduleAction } from "../../../../../src/actions";
import { database, requirePrincipal } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { SchedulePanel } from "../../../../../src/schedule-form";
import { SiteNav } from "../../../../../src/site-nav";

export default async function ScheduledPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const principal = await requirePrincipal();
  const db = database();
  const rows = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found || !can(principal, "site.read", { accountId: found.accountId })) notFound();
  const applied = await runDueSchedules(db, new Date()).catch(() => [] as string[]);
  for (const id of applied) await syncScheduleHost(db, id).catch(() => undefined);
  const schedules = await db.select().from(siteSchedule).where(eq(siteSchedule.siteId, siteId));
  const zone = found.timeZone || "UTC";
  const canPublish = can(principal, "site.publish", { accountId: found.accountId });
  return (
    <Page>
      <SiteNav siteId={found.id} current="scheduled" />
      <PageHeader title="Scheduled" description={`${found.name}. Times use ${zoneTitle(zone)}.`} />
      {schedules.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          description="Schedule a publish when a preview looks right. It stays pinned to that snapshot."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {schedules.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{describeSchedule(item, zone)}</p>
                <p className="text-xs text-muted-foreground">{item.summary}</p>
              </div>
              {canPublish && (item.status === "scheduled" || item.status === "live") ? (
                <div className="flex items-center gap-2">
                  {item.status === "scheduled" ? (
                    <SchedulePanel
                      siteId={found.id}
                      accountId={found.accountId}
                      timeZone={zone}
                      scheduleId={item.id}
                    />
                  ) : null}
                  <form action={cancelScheduleAction}>
                    <input type="hidden" name="siteId" value={found.id} />
                    <input type="hidden" name="accountId" value={found.accountId} />
                    <input type="hidden" name="scheduleId" value={item.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Cancel
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
