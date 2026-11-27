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
import { FormsPluginFrame, submissionFrom } from "../../../../../../../../src/forms-plugin";
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
  const choices = [...forms].sort((left, right) => left.name.localeCompare(right.name));
  const exportHref = selected
    ? `${base}/plugins/forms/export?form=${selected.formKey}`
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
              forms={choices}
            />
            <a href={exportHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Download CSV
            </a>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <Table className="table-fixed">
              <TableHeader className="border-b-0">
                <TableRow>
                  <TableHead className="w-[28%]">From</TableHead>
                  <TableHead className="w-[26%]">Form</TableHead>
                  <TableHead className="w-[28%]">Received</TableHead>
                  <TableHead className="w-[18%] text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{submissionFrom(row.fields)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {names.get(row.leadFormId) ?? ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <LocalTime value={row.createdAt.toISOString()} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <a
                        className="font-medium text-primary"
                        href={`${base}/plugins/forms/${row.id}`}
                      >
                        Open
                      </a>
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
