import {
  buttonVariants,
  cn,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@flagstage/ui";

import { FormFilter } from "../../../../../../../../src/form-filter";
import { loadFormsPlugin } from "../../../../../../../../src/forms-data";
import { FormsPluginFrame } from "../../../../../../../../src/forms-plugin";
import { submissionFrom } from "../../../../../../../../src/forms-submissions";
import { LocalTime } from "../../../../../../../../src/local-time";

export default async function FormsPluginPage({
  params,
  searchParams
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
  searchParams: Promise<{ form?: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const query = await searchParams;
  const { found, forms, submissions, base } = await loadFormsPlugin(accountSlug, siteId);
  const selected = forms.find((form) => form.formKey === query.form);
  const rows = selected ? submissions.filter((row) => row.leadFormId === selected.id) : submissions;
  const names = new Map(forms.map((form) => [form.id, form.name]));
  const exportHref = selected
    ? `${base}/plugins/forms/export?form=${encodeURIComponent(selected.formKey)}`
    : `${base}/plugins/forms/export`;
  return (
    <FormsPluginFrame site={found} base={base} current="submissions">
      {forms.length === 0 ? (
        <EmptyState
          className="max-w-xl"
          title="No forms yet"
          description="Forms show up here when an import finds one on the site. Submissions show up after someone fills one in."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FormFilter
              action={`${base}/plugins/forms`}
              value={selected?.formKey ?? ""}
              forms={forms}
            />
            <a href={exportHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Download CSV
            </a>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              className="max-w-xl"
              title="No submissions yet"
              description={
                selected
                  ? "This form has no submissions yet."
                  : "Submissions show up after someone fills in a form."
              }
            />
          ) : (
            <Table className="sm:table-fixed">
              <TableHeader className="border-b-0">
                <TableRow>
                  <TableHead className="sm:w-[28%]">From</TableHead>
                  <TableHead className="sm:w-[26%]">Form</TableHead>
                  <TableHead className="sm:w-[28%]">Received</TableHead>
                  <TableHead className="hidden text-right sm:table-cell sm:w-[18%]">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="relative hover:bg-[var(--wash)]">
                    <TableCell className="max-w-0 font-medium sm:max-w-none">
                      <a
                        className="block truncate after:absolute after:inset-0"
                        href={`${base}/plugins/forms/${row.id}`}
                      >
                        {submissionFrom(row.fields)}
                        <span className="sr-only"> Open</span>
                      </a>
                    </TableCell>
                    <TableCell className="max-w-0 sm:max-w-none">
                      <span className="block truncate">{names.get(row.leadFormId) ?? ""}</span>
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap text-muted-foreground sm:w-auto">
                      <LocalTime value={row.createdAt.toISOString()} compact />
                    </TableCell>
                    <TableCell className="hidden text-right whitespace-nowrap sm:table-cell">
                      <span className="font-medium text-primary">Open</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </FormsPluginFrame>
  );
}
