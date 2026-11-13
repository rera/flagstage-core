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
  const spent = formatUsd(
    monthEdits.reduce((sum, entry) => {
      const usage = entry.usage as { estimatedUsd?: number } | null;
      return sum + (usage?.estimatedUsd ?? 0);
    }, 0)
  );
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
        <section className="space-y-3">
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
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Usage</h2>
        <p className="text-sm text-muted-foreground" title={spent.title}>
          {monthEdits.length} {monthEdits.length === 1 ? "edit" : "edits"} this month · {spent.text}
        </p>
        {monthEdits.length === 0 ? (
          <EmptyState
            title="No edits yet"
            description="Chat edits show up here with their estimated cost."
          />
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
      <section className="max-w-md space-y-3 rounded-xl border border-border bg-card px-4 py-4">
        <h2 className="text-base font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Monthly model budget. When estimated cost for this month reaches it, the account is marked
          over budget. Edits are not blocked. Each site keeps its own time zone.
        </p>
        {canBudget ? (
          <form action={setBudgetAction} className="space-y-3">
            <input type="hidden" name="accountId" value={found.id} />
            <input type="hidden" name="next" value={`/accounts/${found.id}`} />
            <Field
              label="Budget (USD)"
              name="monthlyBudgetUsd"
              type="number"
              min="0"
              step="1"
              defaultValue={found.monthlyBudgetUsd ?? ""}
            />
            <Button type="submit" variant="outline">
              Save budget
            </Button>
          </form>
        ) : (
          <p className="text-sm">
            Budget: {found.monthlyBudgetUsd == null ? "Not set" : `$${found.monthlyBudgetUsd}`}
          </p>
        )}
      </section>
    </Page>
  );
}
