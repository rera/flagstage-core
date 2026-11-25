import type { ReactNode } from "react";

import { Alert, t } from "@flagstage/ui";

import {
  formatCount,
  sameOn,
  skippedPages,
  typePages,
  type ImportProgressView,
  type ImportSummary
} from "./import-review";

export function ImportProgressPanel({ progress }: { progress: ImportProgressView }) {
  const found = progress.pagesFound;
  const done = progress.pagesDone;
  const parts = [
    progress.stage,
    found != null ? `${t("sites.pagesFound")} ${formatCount(found)}` : null,
    done != null ? `${t("sites.pagesDone")} ${formatCount(done)}` : null
  ].filter((part): part is string => Boolean(part));
  const max = found ?? 0;
  const current = Math.min(done ?? 0, max > 0 ? max : (done ?? 0));
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return (
    <Alert>
      <p>{t("sites.importing")}</p>
      {parts.length > 0 ? <p className="mt-2">{parts.join(" · ")}</p> : null}
      {max > 0 ? (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label="Import progress"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={current}
        >
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {progress.skipped > 0 ? (
        <p className="mt-2 text-muted-foreground">{skippedPages(progress.skipped)}</p>
      ) : null}
    </Alert>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCount(value)}</p>
    </div>
  );
}

export function ImportResultPanel({
  summary,
  goLive
}: {
  summary: ImportSummary;
  goLive: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Your pages are ready to review. Shared sections and page types are set up. Nothing goes
          live until you publish.
        </p>
        {goLive}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pages" value={summary.pages} />
        <Stat label="Shared sections" value={summary.sections.length} />
        <Stat label="Page types" value={summary.pageTypes.length} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <h2 className="text-base font-semibold">Shared sections</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {summary.sections.map((section) => (
              <li key={section.id} className="flex items-baseline justify-between gap-3 py-2">
                <span>{section.name}</span>
                <span className="text-muted-foreground">{sameOn(section.pages)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-card px-4 py-4">
          <h2 className="text-base font-semibold">Page types</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {summary.pageTypes.map((type) => (
              <li key={type.id} className="flex items-baseline justify-between gap-3 py-2">
                <span>{type.name}</span>
                <span className="text-muted-foreground">{typePages(type.pages)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {summary.flags.length > 0 ? (
        <Alert variant="warning" role="status">
          <p className="font-medium">A few blocks need a look. They stayed on their pages.</p>
          <ul className="mt-1">
            {summary.flags.map((flag) => (
              <li
                key={`${flag.detail}\0${flag.pagePath}`}
                className="flex items-baseline justify-between gap-3 border-b border-warning/30 py-2 last:border-b-0"
              >
                <span>{flag.detail}</span>
                <a href={flag.href} className="shrink-0 font-medium text-primary">
                  {flag.label}
                </a>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
