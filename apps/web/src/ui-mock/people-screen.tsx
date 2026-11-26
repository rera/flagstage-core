import { Badge, PageHeader, buttonVariants } from "@flagstage/ui";

import { Page } from "../page";
import { SiteIdentity } from "../site-nav";
import { accountLeads, roleLabel, type MockSite, type Person } from "./data";
import { AddPersonDialog, ChangeRoleDialog, RemovePersonDialog } from "./dialogs";

function PersonRow({ person, siteWide = false }: { person: Person; siteWide?: boolean }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{person.name}</p>
        <p className="truncate text-sm text-muted-foreground">{person.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{siteWide ? "Account admin" : roleLabel(person.role)}</Badge>
        {siteWide ? (
          <span className="text-xs font-medium text-muted-foreground">Inherited</span>
        ) : (
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
        )}
      </div>
    </li>
  );
}

export function SitePeopleScreen({
  site,
  people,
  dialog,
  personEmail
}: {
  site: MockSite;
  people: Person[];
  dialog?: string;
  personEmail?: string;
}) {
  const selected = people.find((person) => person.email === personEmail) ?? people[1] ?? people[0];
  return (
    <Page>
      <SiteIdentity name={site.name} status={site.status} host={site.host} />
      <PageHeader
        level={2}
        title="People"
        description={`People who can open ${site.name}, and what they can do.`}
        actions={
          <a href="?dialog=add" className={buttonVariants()}>
            Add person
          </a>
        }
      />
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">On this site</h3>
          <p className="mt-1 text-sm text-muted-foreground">Roles apply to {site.name} only.</p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {people.map((person) => (
            <PersonRow key={person.email} person={person} />
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Account</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Inherited. Account admins manage every site in Championships.
          </p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {accountLeads.map((person) => (
            <PersonRow key={person.email} person={person} siteWide />
          ))}
        </ul>
      </section>
      {dialog === "add" ? <AddPersonDialog /> : null}
      {selected && dialog === "role" ? <ChangeRoleDialog person={selected} /> : null}
      {selected && dialog === "remove" ? (
        <RemovePersonDialog person={selected} siteName={site.name} />
      ) : null}
    </Page>
  );
}
