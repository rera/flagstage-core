import { Button, PageHeader } from "@flagstage/ui";

import { LocalTime } from "./local-time";
import { Page } from "./page";
import { SiteIdentity } from "./site-nav";
import { SkillDocumentEditor } from "./skill-doc-editor";

export type SkillCard = {
  slug: string;
  name: string;
  description: string;
  body: string;
};

export type SkillHistoryItem = {
  name: string;
  action: string;
  at: string;
  note: string;
};

export function SkillList({
  skills,
  hrefFor
}: {
  skills: SkillCard[];
  hrefFor: (skill: SkillCard) => string;
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
              {skill.description ? (
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {skill.description}
                </span>
              ) : null}
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
  source,
  backHref,
  backLabel,
  scope,
  readOnly = false,
  saveAction,
  history,
  site
}: {
  skill: SkillCard;
  /** The skill file, front matter included. */
  source: string;
  backHref: string;
  backLabel: string;
  scope: string;
  readOnly?: boolean;
  saveAction?: string;
  history: SkillHistoryItem[];
  site?: { name: string; status: string; host: string };
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
        <form
          className="min-w-0 space-y-4"
          action={readOnly ? undefined : saveAction}
          method="post"
        >
          <SkillDocumentEditor source={source} label={skill.name} readOnly={readOnly} />
          {readOnly ? null : (
            <div className="flex justify-end gap-2">
              <a
                href={backHref}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </a>
              <Button type="submit">Save</Button>
            </div>
          )}
        </form>
        <aside className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">History</h2>
          <ol className="divide-y divide-border">
            {history.map((entry) => (
              <li key={`${entry.at}-${entry.action}-${entry.name}`} className="space-y-1 px-4 py-3">
                <p className="text-sm font-medium">
                  {entry.name} · {entry.action}
                </p>
                <p className="text-sm text-muted-foreground">
                  <LocalTime value={entry.at} />
                </p>
                {entry.note ? <p className="text-sm leading-relaxed">{entry.note}</p> : null}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Page>
  );
}
