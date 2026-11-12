import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  Badge,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  t
} from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account, membership, user } from "@flagstage/db";

import { SecretForm } from "../../../../src/secret-form";
import { inviteMember } from "../../../../src/actions";
import { database, requirePrincipal } from "../../../../src/guard";
import { Page } from "../../../../src/page";

export default async function AccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const principal = await requirePrincipal();
  if (!can(principal, "account.read", { accountId })) notFound();
  const db = database();
  const rows = await db.select().from(account).where(eq(account.id, accountId)).limit(1);
  const found = rows[0];
  if (!found) notFound();
  const members = await db.select().from(membership).where(eq(membership.accountId, accountId));
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
  return (
    <Page>
      <PageHeader title={found.name} description={found.slug} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("members.person")}</TableHead>
            <TableHead>{t("members.role")}</TableHead>
            <TableHead>{t("members.source")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>{byId.get(member.userId)?.email ?? member.userId}</TableCell>
              <TableCell>
                <Badge>{t("roles.accountAdmin")}</Badge>
              </TableCell>
              <TableCell>{member.source}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {can(principal, "member.manage", { accountId }) ? (
        <section className="max-w-md space-y-4">
          <h2 className="text-base font-semibold">{t("members.invite")}</h2>
          <SecretForm
            action={inviteMember}
            submit={t("members.invite")}
            secretLabel={t("members.linkOnce")}
          >
            <input type="hidden" name="accountId" value={accountId} />
            <label className="block space-y-2 text-sm font-medium" htmlFor="invite-email">
              <span>{t("signIn.email")}</span>
              <input
                id="invite-email"
                name="email"
                type="email"
                required
                className="h-9 w-full rounded-md border border-input px-3 text-sm font-normal"
              />
            </label>
          </SecretForm>
        </section>
      ) : null}
    </Page>
  );
}
