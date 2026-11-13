import { eq, inArray } from "drizzle-orm";

import { visitsInRange } from "@flagstage/analytics";
import { can } from "@flagstage/core";
import {
  analyticsDaily,
  analyticsEvent,
  formSubmission,
  leadForm,
  membership,
  siteDomain,
  siteSchedule,
  snapshot,
  user
} from "@flagstage/db";
import { describeSchedule } from "@flagstage/publish";
import { Badge, Button, EmptyState } from "@flagstage/ui";

import { approveSiteAction, rollbackAction } from "../../../../../../src/actions";
import { database, requireSite } from "../../../../../../src/guard";
import { Page } from "../../../../../../src/page";
import { SiteIdentity } from "../../../../../../src/site-nav";
import { friendlyWhen, versionLabel } from "../../../../../../src/time";

export default async function SiteOverviewPage({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const { principal, site: found } = await requireSite(accountSlug, siteId);
  const db = database();
  const base = `/a/${accountSlug}/sites/${found.id}`;
  const host = `${found.slug}.localhost`;
  const zone = found.timeZone || "UTC";
  const snaps = (await db.select().from(snapshot).where(eq(snapshot.siteId, siteId))).sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  );
  const current = snaps.find((item) => item.id === found.currentSnapshotId);
  const schedules = await db.select().from(siteSchedule).where(eq(siteSchedule.siteId, siteId));
  const upcoming = schedules
    .filter((item) => item.status === "scheduled")
    .sort((left, right) => left.publishAt.getTime() - right.publishAt.getTime());
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
      <div className="space-y-4">
        <SiteIdentity
          name={found.name}
          status={found.status}
          host={host}
          published={current ? friendlyWhen(current.createdAt, zone) : null}
        />
      </div>
      {showGoLive && pending ? (
        <form action={approveSiteAction}>
          <input type="hidden" name="siteId" value={found.id} />
          <input type="hidden" name="accountId" value={found.accountId} />
          <input type="hidden" name="snapshotId" value={pending.id} />
          <Button type="submit">Go live</Button>
        </form>
      ) : null}
      {found.status === "live" &&
      (!found.draftSnapshotId || found.draftSnapshotId === found.currentSnapshotId) ? (
        <p
          role="status"
          className="rounded-md border border-[var(--brand-signal)]/30 bg-[var(--done-wash)] px-4 py-3 text-sm"
        >
          This snapshot is live.
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <h2 className="text-base font-semibold">History</h2>
          {snaps.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Versions show up after the import finishes.
            </p>
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
            <a href={`${base}/scheduled`} className="text-sm font-medium text-primary">
              All schedules
            </a>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing scheduled. When a draft looks right, use Make changes to pick a time.
            </p>
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
            <a href={`${base}/domain`} className="text-sm font-medium text-primary">
              Domain settings
            </a>
          </div>
          {domains.length === 0 ? (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                No custom domain yet. It still answers on {host}.
              </p>
              <a
                href={`${base}/domain`}
                className="mt-2 inline-block text-sm font-medium text-primary"
              >
                Add a domain
              </a>
            </>
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
            <a href={`${base}/forms`} className="text-sm font-medium text-primary">
              View submissions
            </a>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {forms.length === 0
              ? "No forms yet. They show up here when an import finds one on the site."
              : submissions.length === 0
                ? `${forms.length} ${forms.length === 1 ? "form" : "forms"}. No submissions yet.`
                : `${forms.length} ${forms.length === 1 ? "form" : "forms"} · ${submissions.length} ${submissions.length === 1 ? "submission" : "submissions"}`}
          </p>
        </section>
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Analytics</h2>
            <a href={`${base}/analytics`} className="text-sm font-medium text-primary">
              Last 7 days
            </a>
          </div>
          {pageviews === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No visitors yet. Visits show up after the site is live.
            </p>
          ) : (
            <>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{pageviews}</p>
              <p className="text-sm text-muted-foreground">
                page views · {visitors} {visitors === 1 ? "visitor" : "visitors"}
              </p>
            </>
          )}
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
