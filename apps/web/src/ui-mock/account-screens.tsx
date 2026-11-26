import { Badge, PageHeader, buttonVariants } from "@flagstage/ui";

import { Page } from "../page";
import { Hostname } from "../hostname";
import { accountLeads, championshipSites, pgaPeople, roleLabel, womensPeople } from "./data";
import { SkillList } from "./skills-screen";
import { accountSkills } from "./data";

const sitePeople = {
  pga: pgaPeople,
  womens: womensPeople
} as const;

export function AccountPeopleScreen() {
  return (
    <Page>
      <PageHeader
        title="People"
        description="Account leads manage every site in this account."
        actions={<span className={buttonVariants()}>Add account lead</span>}
      />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Account leads</h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {accountLeads.map((person) => (
            <li
              key={person.email}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{person.name}</p>
                <p className="truncate text-sm text-muted-foreground">{person.email}</p>
              </div>
              <Badge>Account lead</Badge>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Sites</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who has access on each site, besides the account leads.
          </p>
        </div>
        <div className="grid gap-3">
          {championshipSites.map((site) => {
            const people = sitePeople[site.id as keyof typeof sitePeople] ?? [];
            return (
              <section key={site.id} className="rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{site.name}</h3>
                    <Hostname
                      value={site.host}
                      truncate
                      className="font-mono text-xs text-muted-foreground"
                    />
                  </div>
                  <a
                    href={`/a/championships/sites/${site.id}/settings/people`}
                    className="shrink-0 text-sm font-medium text-primary"
                  >
                    People
                  </a>
                </div>
                <ul className="divide-y divide-border">
                  {people.map((person) => (
                    <li
                      key={person.email}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <span className="min-w-0 truncate">{person.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {roleLabel(person.role)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
                  Alex Morgan and Avery Nguyen also have access as account leads.
                </p>
              </section>
            );
          })}
        </div>
      </section>
    </Page>
  );
}

export function AccountSkillsScreen() {
  return (
    <Page>
      <PageHeader
        title="Skills"
        description="The agent follows these skills on every site in this account."
      />
      <SkillList
        skills={accountSkills}
        hrefFor={(skill) => `/a/championships/skills/${skill.slug}`}
      />
    </Page>
  );
}
