import { Badge, PageHeader, buttonVariants } from "@flagstage/ui";

import { Page } from "../page";
import { SiteIdentity } from "../site-nav";
import { accountLeads, roleLabel, type MockSite, type Person } from "./data";
import { AddPersonDialog, ChangeRoleDialog, RemovePersonDialog } from "./dialogs";

function SiteTabs({ site, current }: { site: MockSite; current: "people" | "skills" }) {
  const base = `/a/championships/sites/${site.id}/settings`;
  const tabs = [
    { id: "people" as const, href: `${base}/people`, label: "People" },
    { id: "skills" as const, href: `${base}/skills`, label: "Skills" }
  ];
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Site settings">
      {tabs.map((tab) => {
        const on = tab.id === current;
        return (
          <a
            key={tab.id}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={
              on
                ? "rounded-[10px] bg-[var(--wash)] px-3 py-2 text-sm font-semibold text-foreground"
                : "rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}

function PersonRow({ person, siteWide = false }: { person: Person; siteWide?: boolean }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{person.name}</p>
        <p className="truncate text-sm text-muted-foreground">{person.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{siteWide ? "Account lead" : roleLabel(person.role)}</Badge>
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
      <SiteTabs site={site} current="people" />
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
          <h3 className="text-sm font-semibold">Account leads</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Inherited. Account leads manage every site in Championships.
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

export { SiteTabs };
