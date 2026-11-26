import { Button, PageHeader, Textarea } from "@flagstage/ui";

import { Page } from "../page";
import { SiteIdentity } from "../site-nav";
import type { MockSite, Skill } from "./data";
import { SiteTabs } from "./people-screen";

export function SkillList({
  skills,
  hrefFor
}: {
  skills: Skill[];
  hrefFor: (skill: Skill) => string;
}) {
  return (
    <ul className="grid gap-3">
      {skills.map((skill) => (
        <li key={skill.slug}>
          <a
            href={hrefFor(skill)}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 hover:bg-[var(--wash)]"
          >
            <span className="min-w-0">
              <span className="block font-semibold">{skill.name}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                {skill.description}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-primary">Edit</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function SkillEditor({
  skill,
  backHref,
  backLabel,
  scope,
  readOnly = false,
  site
}: {
  skill: Skill;
  backHref: string;
  backLabel: string;
  scope: string;
  readOnly?: boolean;
  site?: MockSite;
}) {
  return (
    <Page>
      {site ? <SiteIdentity name={site.name} status={site.status} host={site.host} /> : null}
      <div>
        <a href={backHref} className="text-sm font-medium text-primary">
          {backLabel}
        </a>
        <div className="mt-3">
          <PageHeader level={site ? 2 : 1} title={skill.name} description={scope} />
        </div>
      </div>
      {readOnly ? (
        <p className="rounded-xl border border-border bg-[var(--wash)] px-4 py-3 text-sm">
          View only. You can read this skill and its history.
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.8fr)]">
        <form className="space-y-4" action="#">
          {skill.file ? (
            <p className="truncate font-mono text-xs text-muted-foreground" title={skill.file}>
              {skill.file}
            </p>
          ) : null}
          <Textarea
            aria-label={skill.name}
            name="body"
            readOnly={readOnly}
            defaultValue={skill.body}
            className={
              readOnly
                ? "min-h-72 bg-[var(--wash)] font-mono text-[13px] leading-relaxed"
                : "min-h-72 font-mono text-[13px] leading-relaxed"
            }
          />
          {readOnly ? null : (
            <div className="flex justify-end gap-2">
              <a
                href={backHref}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </a>
              <Button type="button">Save</Button>
            </div>
          )}
        </form>
        <aside className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">History</h2>
          <ol className="divide-y divide-border">
            {skill.history.map((entry) => (
              <li key={`${entry.when}-${entry.action}`} className="space-y-1 px-4 py-3">
                <p className="text-sm font-medium">
                  {entry.name} · {entry.action}
                </p>
                <p className="text-sm text-muted-foreground">{entry.when}</p>
                <p className="text-sm leading-relaxed">{entry.note}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Page>
  );
}

export function SiteSkillsList({ site, skills }: { site: MockSite; skills: Skill[] }) {
  return (
    <Page>
      <SiteIdentity name={site.name} status={site.status} host={site.host} />
      <PageHeader
        level={2}
        title="Skills"
        description={`The agent follows these skills on ${site.name}. It also follows the Championships account skills.`}
      />
      <SiteTabs site={site} current="skills" />
      <SkillList
        skills={skills}
        hrefFor={(skill) => `/a/championships/sites/${site.id}/settings/skills/${skill.slug}`}
      />
    </Page>
  );
}
