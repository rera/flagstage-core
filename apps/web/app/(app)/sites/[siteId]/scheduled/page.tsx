import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Button, EmptyState, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { site, siteSchedule } from "@flagstage/db";
import { describeSchedule, runDueSchedules, syncScheduleHost } from "@flagstage/publish";

import { cancelScheduleAction, rescheduleAction } from "../../../../../src/actions";
import { database, requirePrincipal } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { SchedulePanel } from "../../../../../src/schedule-form";

export default async function ScheduledPage({
  params
}: {
  params: Promise<{ siteId: string }>;
}) {
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
  const pinned = found.draftSnapshotId ?? found.currentSnapshotId;
  const canPublish = can(principal, "site.publish", { accountId: found.accountId });
  return (
    <Page>
      <PageHeader
        title="Scheduled"
        description={`${found.name}. Times use ${zone}.`}
        actions={
          <a href={`/sites/${found.id}`} className="text-sm font-medium text-primary">
            {found.name}
          </a>
        }
      />
      {schedules.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          description="Schedule a publish when a preview looks right. It stays pinned to that snapshot."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {schedules.map((item) => (
            <li key={item.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{describeSchedule(item, zone)}</p>
                  <p className="text-xs text-muted-foreground">{item.summary}</p>
                </div>
                {canPublish && (item.status === "scheduled" || item.status === "live") ? (
                  <form action={cancelScheduleAction}>
                    <input type="hidden" name="siteId" value={found.id} />
                    <input type="hidden" name="accountId" value={found.accountId} />
                    <input type="hidden" name="scheduleId" value={item.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Cancel
                    </Button>
                  </form>
                ) : null}
              </div>
              {canPublish && item.status === "scheduled" ? (
                <form action={rescheduleAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="siteId" value={found.id} />
                  <input type="hidden" name="accountId" value={found.accountId} />
                  <input type="hidden" name="scheduleId" value={item.id} />
                  <input type="hidden" name="timeZone" value={zone} />
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>Publish at</span>
                    <input
                      name="publishAt"
                      type="datetime-local"
                      required
                      className="block h-9 rounded-md border border-input px-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>Revert at</span>
                    <input
                      name="revertAt"
                      type="datetime-local"
                      className="block h-9 rounded-md border border-input px-2 text-sm text-foreground"
                    />
                  </label>
                  <Button type="submit" size="sm">
                    Reschedule
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canPublish && pinned ? (
        <SchedulePanel siteId={found.id} accountId={found.accountId} snapshotId={pinned} />
      ) : null}
      <p className="text-sm text-muted-foreground">{t("versions.emptyBody")}</p>
    </Page>
  );
}
