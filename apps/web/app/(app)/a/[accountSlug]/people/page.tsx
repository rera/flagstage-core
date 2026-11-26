import { eq, inArray } from "drizzle-orm";

import { can } from "@flagstage/core";
import { membership, user } from "@flagstage/db";
import { Alert, Badge, PageHeader, buttonVariants } from "@flagstage/ui";

import { database, requireAccount } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { AddPersonDialog, RemovePersonDialog } from "../../../../../src/people-dialogs";
import {
  addAccountPersonAction,
  removeAccountPersonAction
} from "../../../../../src/roster-actions";

export default async function AccountPeoplePage({
  params,
  searchParams
}: {
  params: Promise<{ accountSlug: string }>;
  searchParams: Promise<{ dialog?: string; person?: string; error?: string }>;
}) {
  const { accountSlug } = await params;
  const query = await searchParams;
  const { principal, account: found } = await requireAccount(accountSlug);
  const db = database();
  const members = await db.select().from(membership).where(eq(membership.accountId, found.id));
  const admins = members.filter((member) => member.role === "account_admin");
  const people =
    admins.length === 0
      ? []
      : await db
          .select()
          .from(user)
          .where(
            inArray(
              user.id,
              admins.map((member) => member.userId)
            )
          );
  const rows = people
    .map((person) => ({ id: person.id, name: person.name, email: person.email }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const canManage = can(principal, "member.manage", { accountId: found.id });
  const selected = rows.find((person) => person.email === query.person) ?? rows[0];
  const closeHref = `/a/${found.slug}/people`;
  return (
    <Page>
      <PageHeader
        title="People"
        description="Account admins manage every site in this account."
        actions={
          canManage ? (
            <a href="?dialog=add" className={buttonVariants()}>
              Add person
            </a>
          ) : undefined
        }
      />
      {query.error === "admin" ? (
        <Alert variant="destructive">This account needs an admin.</Alert>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {rows.map((person) => (
          <li
            key={person.email}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{person.name}</p>
              <p className="truncate text-sm text-muted-foreground">{person.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Account admin</Badge>
              {canManage ? (
                <a
                  href={`?dialog=remove&person=${encodeURIComponent(person.email)}`}
                  className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  Remove
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canManage && query.dialog === "add" ? (
        <AddPersonDialog
          action={addAccountPersonAction}
          closeHref={closeHref}
          includeRole={false}
          hidden={{ accountId: found.id }}
        />
      ) : null}
      {canManage && selected && query.dialog === "remove" ? (
        <RemovePersonDialog
          action={removeAccountPersonAction}
          closeHref={closeHref}
          title={`Remove ${selected.name}`}
          body={`${selected.name} will no longer be an account admin. They will lose access to every site in ${found.name}.`}
          hidden={{ accountId: found.id, userId: selected.id }}
        />
      ) : null}
    </Page>
  );
}
