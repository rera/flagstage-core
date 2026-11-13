import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { can } from "@flagstage/core";
import { account, changeRequest, invitation, membership, site, user } from "@flagstage/db";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  t
} from "@flagstage/ui";

import { inviteMember, setBudgetAction } from "../../../../src/actions";
import { database, requirePrincipal } from "../../../../src/guard";
import { formatUsd } from "../../../../src/money";
import { Page } from "../../../../src/page";
import { SecretForm } from "../../../../src/secret-form";
import { friendlyWhen, monthKey } from "../../../../src/time";

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "importing") return "Importing";
  if (status === "preview") return "Ready to publish";
  if (status === "failed") return "Didn't finish";
  return status;
}

export default async function AccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const principal = await requirePrincipal();
  if (!can(principal, "account.read", { accountId })) notFound();
  const db = database();
  const rows = await db.select().from(account).where(eq(account.id, accountId)).limit(1);
  const found = rows[0];
  if (!found) notFound();
  const sites = await db.select().from(site).where(eq(site.accountId, accountId));
  const members = await db.select().from(membership).where(eq(membership.accountId, accountId));
  const invites = await db.select().from(invitation).where(eq(invitation.accountId, accountId));
  const pending = invites.filter((invite) => invite.status === "pending");
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
  const edits =
    sites.length === 0
      ? []
      : await db
          .select()
          .from(changeRequest)
          .where(
            inArray(
              changeRequest.siteId,
              sites.map((item) => item.id)
            )
          );
  const now = new Date();
  const zoneOf = new Map(sites.map((item) => [item.id, item.timeZone || "UTC"]));
  const monthEdits = edits
    .filter((entry) => {
      const zone = zoneOf.get(entry.siteId) || "UTC";
      return monthKey(entry.createdAt, zone) === monthKey(now, zone);
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const spentAmount = monthEdits.reduce((sum, entry) => {
    const usage = entry.usage as { estimatedUsd?: number } | null;
    return sum + (usage?.estimatedUsd ?? 0);
  }, 0);
  const spent = formatUsd(spentAmount);
  const canInvite = can(principal, "member.manage", { accountId });
  const canBudget = can(principal, "org.manage");
  return (
    <Page>
      <header className="border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{found.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {found.slug} · {sites.length} {sites.length === 1 ? "site" : "sites"} · {members.length}{" "}
          {members.length === 1 ? "person" : "people"} ·{" "}
          <span title={spent.title}>{spent.text} estimated this month</span>
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
          <h2 className="text-base font-semibold">Sites</h2>
          {sites.length === 0 ? (
            <EmptyState
              title="No sites yet"
              description="Import a site into this account from Sites."
              action={
                <a href="/sites" className="text-sm font-medium text-primary">
                  {t("nav.sites")}
                </a>
              }
            />
          ) : (
            <div className="grid gap-3">
              {sites.map((item) => (
                <a
                  key={item.id}
                  href={`/sites/${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-[var(--wash)]"
                >
                  <span>
                    <span className="block font-medium">{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.slug}.localhost
                    </span>
                  </span>
                  <Badge variant={item.status === "live" ? "success" : "default"}>
                    {statusLabel(item.status)}
                  </Badge>
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
          <h2 className="text-base font-semibold">People</h2>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is on this account yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{byId.get(member.userId)?.email ?? member.userId}</span>
                  <Badge>
                    {member.role === "account_admin" ? t("roles.accountAdmin") : member.role}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {pending.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {pending.map((invite) => (
                <li key={invite.id}>Invite pending for {invite.email}</li>
              ))}
            </ul>
          ) : null}
          {canInvite ? (
            <SecretForm
              inline
              action={inviteMember}
              submit={t("members.invite")}
              secretLabel={t("members.linkOnce")}
            >
              <input type="hidden" name="accountId" value={accountId} />
              <label
                className="min-w-48 flex-1 space-y-1 text-sm font-medium"
                htmlFor="invite-email"
              >
                <span>{t("signIn.email")}</span>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  placeholder="name@company.com"
                  className="h-9 w-full rounded-md border border-input px-3 text-sm font-normal"
                />
              </label>
            </SecretForm>
          ) : null}
        </section>
      </div>
      <section className="space-y-4 rounded-xl border border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">This month</h2>
            <p className="mt-1 text-sm" title={spent.title}>
              {found.monthlyBudgetUsd == null
                ? `${spent.text} estimated`
                : `${spent.text} of $${found.monthlyBudgetUsd} budget`}
            </p>
          </div>
          {canBudget ? (
            <form action={setBudgetAction} className="flex items-end gap-2">
              <input type="hidden" name="accountId" value={found.id} />
              <input type="hidden" name="next" value={`/accounts/${found.id}`} />
              <Field
                label="Budget (USD)"
                name="monthlyBudgetUsd"
                type="number"
                min="0"
                step="1"
                defaultValue={found.monthlyBudgetUsd ?? ""}
                className="w-28"
              />
              <Button type="submit" variant="outline">
                Save
              </Button>
            </form>
          ) : null}
        </div>
        {found.monthlyBudgetUsd != null && found.monthlyBudgetUsd > 0 ? (
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full bg-primary"
              style={{
                width:
                  spentAmount > 0
                    ? `max(0.75rem, ${Math.min(100, (spentAmount / found.monthlyBudgetUsd) * 100)}%)`
                    : "0%"
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No budget yet. Set one to compare this month&apos;s estimate.
          </p>
        )}
        {monthEdits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No edits yet this month.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthEdits.map((entry) => {
                const usage = entry.usage as { estimatedUsd?: number } | null;
                const cost = formatUsd(usage?.estimatedUsd ?? 0);
                const owner = sites.find((item) => item.id === entry.siteId);
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">
                      {friendlyWhen(entry.createdAt, owner?.timeZone || "UTC")}
                    </TableCell>
                    <TableCell>{owner?.name}</TableCell>
                    <TableCell title={cost.title}>{cost.text}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </Page>
  );
}
