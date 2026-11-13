import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { can } from "@flagstage/core";
import { formSubmission, leadForm, site } from "@flagstage/db";
import { EmptyState, PageHeader, Table, TableBody, TableCell, TableRow, t } from "@flagstage/ui";

import { database, requirePrincipal } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { SiteIdentity, SiteNav } from "../../../../../src/site-nav";
import { friendlyWhen } from "../../../../../src/time";

export default async function FormsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const principal = await requirePrincipal();
  const db = database();
  const sites = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = sites[0];
  if (!found || !can(principal, "form.read", { accountId: found.accountId })) notFound();
  const forms = await db.select().from(leadForm).where(eq(leadForm.siteId, siteId));
  const submissions =
    forms.length === 0
      ? []
      : await db
          .select()
          .from(formSubmission)
          .where(
            inArray(
              formSubmission.leadFormId,
              forms.map((form) => form.id)
            )
          );
  const names = new Map(forms.map((form) => [form.id, form.name]));
  const newest = [...submissions].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  );
  const zone = found.timeZone || "UTC";
  return (
    <Page>
      <div className="space-y-4">
        <SiteIdentity
          siteId={found.id}
          name={found.name}
          status={found.status}
          host={`${found.slug}.localhost`}
        />
        <SiteNav siteId={found.id} current="forms" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(16rem,22rem)]">
        <div className="space-y-4">
          <PageHeader
            level={2}
            title={t("forms.title")}
            description="Submissions from forms on this site."
          />
          {submissions.length === 0 ? (
            <EmptyState
              title={t("forms.emptyTitle")}
              description={t("forms.emptyBody")}
              action={
                <a href={`/sites/${siteId}`} className="text-sm font-medium text-primary">
                  {t("forms.emptyAction")}
                </a>
              }
            />
          ) : (
            <Table>
              <TableBody>
                {newest.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{names.get(row.leadFormId) ?? row.leadFormId}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {friendlyWhen(row.createdAt, zone)}
                    </TableCell>
                    <TableCell>
                      <a
                        className="font-medium text-primary"
                        href={`/sites/${siteId}/forms/${forms.find((form) => form.id === row.leadFormId)?.formKey ?? ""}`}
                      >
                        {t("forms.download")}
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <aside className="rounded-xl border border-border bg-card px-4 py-4 text-sm">
          <h2 className="font-semibold">Where forms come from</h2>
          <p className="mt-2 text-muted-foreground">
            An import records each form it finds. New submissions show up here, newest first.
          </p>
        </aside>
      </div>
    </Page>
  );
}
