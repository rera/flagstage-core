import { Badge, PageHeader, buttonVariants } from "@flagstage/ui";

import { Page } from "../page";
import { accountLeads, accountSkills } from "./data";
import { AddPersonDialog, RemoveAccountPersonDialog } from "./dialogs";
import { SkillList } from "./skills-screen";

export function AccountPeopleScreen({
  dialog,
  personEmail
}: {
  dialog?: string;
  personEmail?: string;
}) {
  const selected =
    accountLeads.find((person) => person.email === personEmail) ??
    accountLeads[1] ??
    accountLeads[0];
  return (
    <Page>
      <PageHeader
        title="People"
        description="Account admins manage every site in this account."
        actions={
          <a href="?dialog=add" className={buttonVariants()}>
            Add person
          </a>
        }
      />
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Account admin</Badge>
              <a
                href={`?dialog=remove&person=${encodeURIComponent(person.email)}`}
                className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Remove
              </a>
            </div>
          </li>
        ))}
      </ul>
      {dialog === "add" ? <AddPersonDialog includeRole={false} /> : null}
      {selected && dialog === "remove" ? <RemoveAccountPersonDialog person={selected} /> : null}
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
