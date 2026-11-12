import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { visitsInRange } from "@flagstage/analytics";
import { can } from "@flagstage/core";
import {
  analyticsDaily,
  analyticsEvent,
  formSubmission,
  leadForm,
  membership,
  site,
  siteDomain,
  siteSchedule,
  snapshot,
  user
} from "@flagstage/db";
import { describeSchedule } from "@flagstage/publish";
import { Badge, Button, buttonVariants, EmptyState } from "@flagstage/ui";

import { approveSiteAction, rollbackAction } from "../../../../src/actions";
import { database, requirePrincipal } from "../../../../src/guard";
import { Page } from "../../../../src/page";
import { SiteNav } from "../../../../src/site-nav";
import { friendlyWhen, versionLabel } from "../../../../src/time";

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "importing") return "Importing";
  if (status === "preview") return "Ready to publish";
  if (status === "failed") return "Didn't finish";
  return status;
}

export default async function SiteOverviewPage({
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
  const host = `${found.slug}.localhost`;
  const zone = found.timeZone || "UTC";
  const snaps = (await db.select().from(snapshot).where(eq(snapshot.siteId, siteId))).sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  );
  const current = snaps.find((item) => item.id === found.currentSnapshotId);
  const schedules = await db.select().from(siteSchedule).where(eq(siteSchedule.siteId, siteId));
  const upcoming = schedules.filter((item) => item.status === "scheduled");
  const domains = await db.select().from(siteDomain).where(eq(siteDomain.siteId, siteId));
  const forms = await db.select().from(leadForm).where(eq(leadForm.siteId, siteId));
  const submissions =
    forms.length === 0
      ? []
      : await db
          .select()
          .from(formSubmission)
          .where(
            inArray(
              formSubmission.leadFormId,
              forms.map((form) => form.id)
            )
          );
  const daily = await db.select().from(analyticsDaily).where(eq(analyticsDaily.siteId, siteId));
  const recent = await db.select().from(analyticsEvent).where(eq(analyticsEvent.siteId, siteId));
  const week = visitsInRange(
    daily,
    recent.map((event) => ({
      siteId: event.siteId,
      path: event.path,
      referrer: event.referrer,
      visitorHash: event.visitorHash,
      createdAt: event.createdAt
    })),
    new Date(),
    7
  );
  const pageviews = week.reduce((sum, row) => sum + row.pageviews, 0);
  const visitors = week.reduce((sum, row) => sum + row.visitors, 0);
  const members = await db
    .select()
    .from(membership)
    .where(eq(membership.accountId, found.accountId));
  const people =
    members.length === 0
      ? []
      : await db
          .select()
          .from(user)
          .where(
            inArray(
              user.id,
              members.map((member) => member.userId)
            )
          );
  const byId = new Map(people.map((person) => [person.id, person]));
  const canPublish = can(principal, "site.publish", { accountId: found.accountId });
  const pending = snaps.find((item) => item.kind === "import");
  const showGoLive =
    canPublish && !found.currentSnapshotId && found.status === "preview" && Boolean(pending);
  return (
    <Page>
      <SiteNav siteId={found.id} current="overview" editor={false} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{found.name}</h1>
            <Badge variant={found.status === "live" ? "success" : "default"}>
              {statusLabel(found.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{host}</span>
            {current
              ? ` · Published ${friendlyWhen(current.createdAt, zone)}`
              : " · Nothing published yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showGoLive && pending ? (
            <form action={approveSiteAction}>
              <input type="hidden" name="siteId" value={found.id} />
              <input type="hidden" name="accountId" value={found.accountId} />
              <input type="hidden" name="snapshotId" value={pending.id} />
              <Button type="submit">Go live</Button>
            </form>
          ) : null}
          <a href={`/sites/${found.id}/edit`} className={buttonVariants()}>
            Make changes
          </a>
        </div>
      </header>
      {found.status === "live" &&
      (!found.draftSnapshotId || found.draftSnapshotId === found.currentSnapshotId) ? (
        <p
          role="status"
          className="rounded-md border border-[var(--brand-signal)]/30 bg-[var(--done-wash)] px-4 py-3 text-sm"
        >
          This snapshot is live.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <h2 className="text-base font-semibold">History</h2>
          <p className="mt-1 text-sm text-muted-foreground">Publishes and earlier versions.</p>
          {snaps.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No versions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {snaps.map((item) => {
                const label = versionLabel(item.kind, item.id, found.currentSnapshotId);
                const restore =
                  canPublish && label === "Published" && item.id !== found.currentSnapshotId;
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <span className="font-medium">{label}</span>
                    <span className="ml-auto text-muted-foreground">
                      {friendlyWhen(item.createdAt, zone)}
                    </span>
                    {restore ? (
                      <form action={rollbackAction}>
                        <input type="hidden" name="siteId" value={found.id} />
                        <input type="hidden" name="accountId" value={found.accountId} />
                        <input type="hidden" name="snapshotId" value={item.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Restore
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Scheduled</h2>
            <a href={`/sites/${found.id}/scheduled`} className="text-sm font-medium text-primary">
              All schedules
            </a>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing is waiting to go live.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {upcoming.map((item) => (
                <li key={item.id} className="font-medium">
                  {describeSchedule(item, zone)}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Domain</h2>
            <a href={`/sites/${found.id}/domain`} className="text-sm font-medium text-primary">
              Domain settings
            </a>
          </div>
          {domains.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No custom domain yet. The site answers on {host}.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {domains.map((domain) => (
                <li key={domain.id} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">{domain.hostname}</span>
                  <Badge variant={domain.status === "active" ? "success" : "warning"}>
                    {domain.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Forms</h2>
            <a href={`/sites/${found.id}/forms`} className="text-sm font-medium text-primary">
              View submissions
            </a>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {forms.length} {forms.length === 1 ? "form" : "forms"} · {submissions.length}{" "}
            {submissions.length === 1 ? "submission" : "submissions"}
          </p>
        </section>
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Analytics</h2>
            <a href={`/sites/${found.id}/analytics`} className="text-sm font-medium text-primary">
              Last 7 days
            </a>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{pageviews}</p>
          <p className="text-sm text-muted-foreground">
            page views · {visitors} {visitors === 1 ? "visitor" : "visitors"}
          </p>
        </section>
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">People</h2>
            <a href={`/accounts/${found.accountId}`} className="text-sm font-medium text-primary">
              Manage access
            </a>
          </div>
          {members.length === 0 ? (
            <EmptyState
              title="No one has access yet"
              description="Invite someone from the account."
            />
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3">
                  <span>{byId.get(member.userId)?.email ?? member.userId}</span>
                  <span className="text-muted-foreground">Account admin</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
