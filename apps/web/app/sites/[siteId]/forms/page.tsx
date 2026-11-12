import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { can } from "@flagstage/core";
import { formSubmission, leadForm, site } from "@flagstage/db";
import { EmptyState, PageHeader, t } from "@flagstage/ui";

import { database, requirePrincipal } from "../../../../src/guard";

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
    <>
      <PageHeader title={t("forms.title")} description={found.name} />
      {submissions.length === 0 ? (
        <EmptyState
          title={t("forms.emptyTitle")}
          description={t("forms.emptyBody")}
          action={<a href={`/sites/${siteId}`}>{t("forms.emptyAction")}</a>}
        />
      ) : (
        <table className="data">
          <tbody>
            {submissions.map((row) => (
              <tr key={row.id}>
                <td>{names.get(row.leadFormId) ?? row.leadFormId}</td>
                <td className="mono">{row.createdAt.toISOString()}</td>
                <td>
                  <a
                    href={`/sites/${siteId}/forms/${forms.find((form) => form.id === row.leadFormId)?.formKey ?? ""}`}
                  >
                    {t("forms.download")}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
