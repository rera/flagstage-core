import { eq, inArray } from "drizzle-orm";

import { can, SITE_ROLE_LABEL, SITE_ROLES, type SiteRole } from "@flagstage/core";
import { membership, siteMembership, user } from "@flagstage/db";
import { Alert, Badge, PageHeader, buttonVariants } from "@flagstage/ui";

import { database, requireSite } from "../../../../../../../../src/guard";
import { Page } from "../../../../../../../../src/page";
import {
  AddPersonDialog,
  ChangeRoleDialog,
  RemovePersonDialog
} from "../../../../../../../../src/people-dialogs";
import {
  addSitePersonAction,
  changeSiteRoleAction,
  removeSitePersonAction
} from "../../../../../../../../src/roster-actions";
import { SiteSettingsNav } from "../../../../../../../../src/site-settings-nav";
import { SiteIdentity } from "../../../../../../../../src/site-nav";

function isSiteRole(role: string): role is SiteRole {
  return (SITE_ROLES as readonly string[]).includes(role);
}

export default async function SitePeoplePage({
  params,
  searchParams
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
  searchParams: Promise<{ dialog?: string; person?: string; error?: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const query = await searchParams;
  const { principal, account: foundAccount, site: found } = await requireSite(accountSlug, siteId);
  const db = database();
  const grants = await db.select().from(siteMembership).where(eq(siteMembership.siteId, found.id));
  const admins = (
    await db.select().from(membership).where(eq(membership.accountId, found.accountId))
  ).filter((member) => member.role === "account_admin");
  const ids = [
    ...new Set([...grants.map((row) => row.userId), ...admins.map((row) => row.userId)])
  ];
  const people = ids.length === 0 ? [] : await db.select().from(user).where(inArray(user.id, ids));
  const byId = new Map(people.map((person) => [person.id, person]));
  const onSite = grants
    .flatMap((grant) => {
      const person = byId.get(grant.userId);
      if (!person || !isSiteRole(grant.role)) return [];
      return [{ id: person.id, name: person.name, email: person.email, role: grant.role }];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const inherited = admins
    .flatMap((member) => {
      const person = byId.get(member.userId);
      if (!person) return [];
      return [{ id: person.id, name: person.name, email: person.email }];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const canManage = can(principal, "site.people", { accountId: found.accountId, siteId: found.id });
  const selected = onSite.find((person) => person.email === query.person) ?? onSite[0];
  const closeHref = `/a/${accountSlug}/sites/${found.id}/settings/people`;
  const host = `${found.slug}.localhost`;
  return (
    <Page>
      <SiteIdentity name={found.name} status={found.status} host={host} />
      <SiteSettingsNav base={`/a/${accountSlug}/sites/${found.id}`} current="people" />
      <PageHeader
        level={2}
        title="People"
        description={`People who can open ${found.name}, and what they can do.`}
        actions={
          canManage ? (
            <a href="?dialog=add" className={buttonVariants()}>
              Add person
            </a>
          ) : undefined
        }
      />
      {query.error === "owner" ? (
        <Alert variant="destructive">This site needs an owner.</Alert>
      ) : null}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">On this site</h3>
          <p className="mt-1 text-sm text-muted-foreground">Roles apply to {found.name} only.</p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {onSite.map((person) => (
            <li
              key={person.email}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{person.name}</p>
                <p className="truncate text-sm text-muted-foreground">{person.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{SITE_ROLE_LABEL[person.role]}</Badge>
                {canManage ? (
                  <>
                    <a
                      href={`?dialog=role&person=${encodeURIComponent(person.email)}`}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent"
                    >
                      Change role
                    </a>
                    <a
                      href={`?dialog=remove&person=${encodeURIComponent(person.email)}`}
                      className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </a>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Account</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Inherited. Account admins manage every site in {foundAccount.name}.
          </p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {inherited.map((person) => (
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
                <span className="text-xs font-medium text-muted-foreground">Inherited</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {canManage && query.dialog === "add" ? (
        <AddPersonDialog
          action={addSitePersonAction}
          closeHref={closeHref}
          hidden={{ siteId: found.id }}
        />
      ) : null}
      {canManage && selected && query.dialog === "role" ? (
        <ChangeRoleDialog
          action={changeSiteRoleAction}
          closeHref={closeHref}
          person={selected}
          hidden={{ siteId: found.id, userId: selected.id }}
        />
      ) : null}
      {canManage && selected && query.dialog === "remove" ? (
        <RemovePersonDialog
          action={removeSitePersonAction}
          closeHref={closeHref}
          title={`Remove ${selected.name}`}
          body={`${selected.name} will lose access to ${found.name}. Account admins are unchanged.`}
          hidden={{ siteId: found.id, userId: selected.id }}
        />
      ) : null}
    </Page>
  );
}
