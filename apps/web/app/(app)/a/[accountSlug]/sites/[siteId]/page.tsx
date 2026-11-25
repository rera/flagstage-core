import { eq, inArray } from "drizzle-orm";

import { visitsInRange } from "@flagstage/analytics";
import { loadConfig } from "@flagstage/config";
import { can } from "@flagstage/core";
import {
  analyticsDaily,
  analyticsEvent,
  formSubmission,
  importRun,
  leadForm,
  membership,
  siteDomain,
  siteSchedule,
  snapshot,
  user
} from "@flagstage/db";
import { describeSchedule } from "@flagstage/publish";
import { createBlobStore } from "@flagstage/storage";
import { Alert, Badge, Button, EmptyState, t } from "@flagstage/ui";

import { approveSiteAction, rollbackAction } from "../../../../../../src/actions";
import { database, requireSite } from "../../../../../../src/guard";
import { ImportProgressPanel, ImportResultPanel } from "../../../../../../src/import-panels";
import { readImportProgress } from "../../../../../../src/import-review";
import { readSnapshotImport } from "../../../../../../src/import-snapshot";
import { ImportWatch } from "../../../../../../src/import-watch";
import { Hostname } from "../../../../../../src/hostname";
import { LocalTime } from "../../../../../../src/local-time";
import { Page } from "../../../../../../src/page";
import { SiteIdentity } from "../../../../../../src/site-nav";
import { versionLabel } from "../../../../../../src/time";

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
  const personIds = [
    ...new Set([
      ...members.map((member) => member.userId),
      ...snaps.map((item) => item.createdBy).filter((id): id is string => Boolean(id))
    ])
  ];
  const people =
    personIds.length === 0 ? [] : await db.select().from(user).where(inArray(user.id, personIds));
  const byId = new Map(people.map((person) => [person.id, person]));
  const history = snaps.slice(0, 3);
  const canPublish = can(principal, "site.publish", { accountId: found.accountId });
  const pending = snaps.find((item) => item.kind === "import");
  const showGoLive =
    canPublish && !found.currentSnapshotId && found.status === "preview" && Boolean(pending);
  const runs = (await db.select().from(importRun).where(eq(importRun.siteId, siteId))).sort(
    (left, right) => left.updatedAt.getTime() - right.updatedAt.getTime()
  );
  const latest = runs.at(-1);
  const importing = found.status === "importing";
  const progress = readImportProgress(latest?.stats);
  const summary =
    showGoLive && pending
      ? await readSnapshotImport(
          createBlobStore(loadConfig()),
          pending.storagePrefix,
          latest?.stats,
          latest?.fidelityReport,
          found.id
        )
      : null;
  const cards = {
    history,
    found,
    zone,
    byId,
    canPublish,
    base,
    host,
    upcoming,
    domains,
    forms,
    submissions,
    pageviews,
    visitors,
    members,
    accountSlug
  };
  return (
    <Page>
      {importing ? <ImportWatch siteId={found.id} /> : null}
      <SiteIdentity
        name={found.name}
        status={found.status}
        host={host}
        published={current ? current.createdAt.toISOString() : null}
      />
      {importing ? <ImportProgressPanel progress={progress} /> : null}
      {found.status === "failed" ? (
        <Alert variant="destructive">{latest?.error || t("sites.failed")}</Alert>
      ) : null}
      {summary ? (
        <ImportResultPanel
          summary={summary}
          goLive={
            <form action={approveSiteAction}>
              <input type="hidden" name="siteId" value={found.id} />
              <input type="hidden" name="accountId" value={found.accountId} />
              <input type="hidden" name="snapshotId" value={pending?.id ?? ""} />
              <Button type="submit">Go live</Button>
            </form>
          }
        />
      ) : null}
      {!importing &&
      !summary &&
      found.draftSnapshotId &&
      found.draftSnapshotId !== found.currentSnapshotId ? (
        <p role="status" className="rounded-md border border-border bg-card px-4 py-3 text-sm">
          A draft is waiting to go live.
        </p>
      ) : null}
      {!importing && !summary && upcoming[0] ? (
        <p className="rounded-md border border-border bg-card px-4 py-3 text-sm">
          {describeSchedule(upcoming[0], zone)}
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <HistoryCard {...cards} />
        {importing ? <ScheduledCard {...cards} /> : null}
        {importing ? <DomainCard {...cards} /> : null}
        {summary || importing ? null : <ScheduledCard {...cards} />}
        {summary || importing ? null : <DomainCard {...cards} />}
        <FormsCard {...cards} />
        {summary || importing ? null : <AnalyticsCard {...cards} />}
        {summary || importing ? null : <PeopleCard {...cards} />}
      </div>
    </Page>
  );
}

type Cards = {
  history: Array<{
    id: string;
    kind: string;
    createdAt: Date;
    createdBy: string | null;
  }>;
  found: {
    id: string;
    accountId: string;
    currentSnapshotId: string | null;
  };
  zone: string;
  byId: Map<string, { name: string | null; email: string }>;
  canPublish: boolean;
  base: string;
  host: string;
  upcoming: Array<Parameters<typeof describeSchedule>[0]>;
  domains: Array<{ id: string; hostname: string; status: string }>;
  forms: Array<{ id: string }>;
  submissions: Array<{ id: string }>;
  pageviews: number;
  visitors: number;
  members: Array<{ id: string; userId: string; role: string }>;
  accountSlug: string;
};

function HistoryCard({ history, found, byId, canPublish }: Cards) {
  return (
    <section className="rounded-xl border border-border bg-card px-4 py-4">
      <h2 className="text-base font-semibold">History</h2>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Versions show up after the import finishes.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {history.map((item) => {
            const label = versionLabel(item.kind, item.id, found.currentSnapshotId);
            const shown = item.kind === "import" && label !== "Published" ? "Import" : label;
            const who = item.createdBy ? byId.get(item.createdBy) : undefined;
            const restore =
              canPublish && label === "Published" && item.id !== found.currentSnapshotId;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{shown}</span>
                  <span className="block truncate text-muted-foreground">
                    {who?.name || who?.email || "Someone on the account"}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  <LocalTime value={item.createdAt.toISOString()} />
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
  );
}

function ScheduledCard({ upcoming, base, zone }: Cards) {
  return (
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
  );
}

function DomainCard({ domains, base, host }: Cards) {
  return (
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
            No custom domain yet. It still answers on{" "}
            <Hostname value={host} className="font-mono" />.
          </p>
          <a href={`${base}/domain`} className="mt-2 inline-block text-sm font-medium text-primary">
            Add a domain
          </a>
        </>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {domains.map((domain) => (
            <li key={domain.id} className="flex min-w-0 items-center justify-between gap-3">
              <Hostname value={domain.hostname} truncate className="font-mono text-xs" />
              <Badge
                variant={domain.status === "active" ? "success" : "warning"}
                className="shrink-0"
              >
                {domain.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FormsCard({ forms, submissions, base }: Cards) {
  return (
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
  );
}

function AnalyticsCard({ pageviews, visitors, base }: Cards) {
  return (
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
  );
}

function PeopleCard({ members, byId, accountSlug }: Cards) {
  return (
    <section className="rounded-xl border border-border bg-card px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">People</h2>
        <a href={`/a/${accountSlug}/people`} className="text-sm font-medium text-primary">
          Manage access
        </a>
      </div>
      {members.length === 0 ? (
        <EmptyState title="No one has access yet" description="Invite someone from the account." />
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3">
              <span>{byId.get(member.userId)?.email ?? member.userId}</span>
              <span className="text-muted-foreground">
                {member.role === "account_admin"
                  ? "Account admin"
                  : member.role === "member"
                    ? "Member"
                    : member.role}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
