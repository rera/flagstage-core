import { eq } from "drizzle-orm";

import { Button, EmptyState, PageHeader } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { siteSchedule } from "@flagstage/db";
import { describeSchedule, runDueSchedules, syncScheduleHost } from "@flagstage/publish";
import { zoneTitle } from "@flagstage/publish/when";

import { cancelScheduleAction } from "../../../../../../../src/actions";
import { database, requireSite } from "../../../../../../../src/guard";
import { Page } from "../../../../../../../src/page";
import { SchedulePanel } from "../../../../../../../src/schedule-form";
import { SiteIdentity } from "../../../../../../../src/site-nav";

export default async function ScheduledPage({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const { principal, site: found } = await requireSite(accountSlug, siteId);
  const db = database();
  const applied = await runDueSchedules(db, new Date()).catch(() => [] as string[]);
  for (const id of applied) await syncScheduleHost(db, id).catch(() => undefined);
  const schedules = (
    await db.select().from(siteSchedule).where(eq(siteSchedule.siteId, siteId))
  ).sort((left, right) => right.publishAt.getTime() - left.publishAt.getTime());
  const zone = found.timeZone || "UTC";
  const canPublish = can(principal, "site.publish", { accountId: found.accountId });
  return (
    <Page>
      <div className="space-y-4">
        <SiteIdentity name={found.name} status={found.status} host={`${found.slug}.localhost`} />
      </div>
      <PageHeader level={2} title="Scheduled" description={`Times use ${zoneTitle(zone)}.`} />
      {schedules.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          description="When a draft looks right, use Make changes to pick a time. It stays pinned to that snapshot."
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
