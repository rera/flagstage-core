import { notFound } from "next/navigation";

import { loadFormsPlugin } from "../../../../../../../../../src/forms-data";
import { FormsPluginFrame } from "../../../../../../../../../src/forms-plugin";
import { submissionEntries } from "../../../../../../../../../src/forms-submissions";
import { LocalTime } from "../../../../../../../../../src/local-time";

export default async function FormSubmissionPage({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string; submissionId: string }>;
}) {
  const { accountSlug, siteId, submissionId } = await params;
  const { found, forms, submissions, base } = await loadFormsPlugin(accountSlug, siteId);
  const row = submissions.find((item) => item.id === submissionId);
  const form = forms.find((item) => item.id === row?.leadFormId);
  if (!row || !form) notFound();
  const entries = submissionEntries(row.fields);
  return (
    <FormsPluginFrame site={found} base={base} current="submissions">
      <article className="max-w-2xl space-y-3">
        <a href={`${base}/plugins/forms`} className="text-sm font-medium text-primary">
          All submissions
        </a>
        <h3 className="text-base font-semibold">{form.name}</h3>
        <dl className="divide-y divide-border rounded-xl border border-border bg-card">
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm text-muted-foreground">Received</dt>
            <dd className="text-sm">
              <LocalTime value={row.createdAt.toISOString()} />
            </dd>
          </div>
          {entries.map((entry) => (
            <div
              key={entry.key}
              className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
            >
              <dt className="text-sm text-muted-foreground">{entry.label}</dt>
              <dd className="text-sm break-words whitespace-pre-wrap">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </article>
    </FormsPluginFrame>
  );
}
