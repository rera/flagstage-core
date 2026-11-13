import { eq, inArray } from "drizzle-orm";

import { can } from "@flagstage/core";
import { invitation, membership, user } from "@flagstage/db";
import { Badge, PageHeader, t } from "@flagstage/ui";

import { inviteMember } from "../../../../../src/actions";
import { database, requireAccount } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { SecretForm } from "../../../../../src/secret-form";

function roleLabel(role: string) {
  if (role === "account_admin") return t("roles.accountAdmin");
  if (role === "member") return t("roles.member");
  return role;
}

export default async function AccountPeoplePage({
  params
}: {
  params: Promise<{ accountSlug: string }>;
}) {
  const { accountSlug } = await params;
  const { principal, account: found } = await requireAccount(accountSlug);
  const db = database();
  const members = await db.select().from(membership).where(eq(membership.accountId, found.id));
  const invites = await db.select().from(invitation).where(eq(invitation.accountId, found.id));
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
  const canInvite = can(principal, "member.manage", { accountId: found.id });
  return (
    <Page>
      <PageHeader
        title="People"
        description={
          canInvite
            ? "People who can open this account, and invites that are still waiting."
            : "People who can open this account."
        }
      />
      <section className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one is on this account yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                <span>{byId.get(member.userId)?.email ?? member.userId}</span>
                <Badge>{roleLabel(member.role)}</Badge>
              </li>
            ))}
          </ul>
        )}
        {pending.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {pending.map((invite) => (
              <li key={invite.id}>
                Invite pending for {invite.email} · {roleLabel(invite.role)}
              </li>
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
            <input type="hidden" name="accountId" value={found.id} />
            <label className="min-w-48 flex-1 space-y-1 text-sm font-medium" htmlFor="invite-email">
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
    </Page>
  );
}
