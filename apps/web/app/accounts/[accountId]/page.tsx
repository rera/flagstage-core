import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Badge, PageHeader, TextField, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account, membership, user } from "@flagstage/db";

import { SecretForm } from "../../secret-form";
import { inviteMember } from "../../../src/actions";
import { database, requirePrincipal } from "../../../src/guard";

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
    <>
      <PageHeader title={found.name} description={found.slug} />
      <table className="data">
        <thead>
          <tr>
            <th>{t("members.person")}</th>
            <th>{t("members.role")}</th>
            <th>{t("members.source")}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>{byId.get(member.userId)?.email ?? member.userId}</td>
              <td>
                <Badge>{t("roles.accountAdmin")}</Badge>
              </td>
              <td>{member.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {can(principal, "member.manage", { accountId }) ? (
        <>
          <h2>{t("members.invite")}</h2>
          <SecretForm
            action={inviteMember}
            submit={t("members.invite")}
            secretLabel={t("members.linkOnce")}
          >
            <input type="hidden" name="accountId" value={accountId} />
            <TextField label={t("signIn.email")} name="email" type="email" required />
          </SecretForm>
        </>
      ) : null}
    </>
  );
}
