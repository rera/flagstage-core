import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { can } from "@flagstage/core";
import { formSubmission, leadForm, site } from "@flagstage/db";
import { EmptyState, PageHeader, Table, TableBody, TableCell, TableRow, t } from "@flagstage/ui";

import { database, requirePrincipal } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { SiteNav } from "../../../../../src/site-nav";

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
  return (
    <Page>
      <SiteNav siteId={found.id} current="forms" />
      <PageHeader title={t("forms.title")} description={found.name} />
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
            {submissions.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{names.get(row.leadFormId) ?? row.leadFormId}</TableCell>
                <TableCell className="font-mono text-xs">{row.createdAt.toISOString()}</TableCell>
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
    </Page>
  );
}
