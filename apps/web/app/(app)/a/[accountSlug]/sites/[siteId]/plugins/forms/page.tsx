import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  t
} from "@flagstage/ui";

import { loadFormsPlugin } from "../../../../../../../../src/forms-data";
import { FormsPluginFrame, submissionFrom } from "../../../../../../../../src/forms-plugin";
import { LocalTime } from "../../../../../../../../src/local-time";

export default async function FormsPluginPage({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const { found, forms, submissions, base } = await loadFormsPlugin(accountSlug, siteId);
  return (
    <FormsPluginFrame site={found} base={base} current="submissions">
      {forms.length === 0 ? (
        <EmptyState
          className="max-w-xl"
          title="No forms yet"
          description="Forms show up here when an import finds one on the site. Submissions show up after someone fills one in."
        />
      ) : (
        <div className="space-y-8">
          {forms.map((form) => {
            const rows = submissions.filter((row) => row.leadFormId === form.id);
            return (
              <section key={form.id} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">{form.name}</h3>
                  <a
                    className="shrink-0 text-sm font-medium text-primary"
                    href={`/sites/${found.id}/forms/${form.formKey}`}
                  >
                    {t("forms.download")}
                  </a>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No submissions yet.</p>
                ) : (
                  <Table>
                    <TableHeader className="border-b-0">
                      <TableRow>
                        <TableHead>From</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">Open</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {submissionFrom(row.fields)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <LocalTime value={row.createdAt.toISOString()} />
                          </TableCell>
                          <TableCell className="text-right">
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
              </section>
            );
          })}
        </div>
      )}
    </FormsPluginFrame>
  );
}
