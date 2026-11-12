import { eq } from "drizzle-orm";

import { can } from "@flagstage/core";
import { formSubmission, leadForm, site } from "@flagstage/db";
import { toCsv } from "@flagstage/forms";

import { database, requirePrincipal } from "../../../../../src/guard";

export async function GET(
  _request: Request,
  context: { params: Promise<{ siteId: string; formKey: string }> }
) {
  const { siteId, formKey } = await context.params;
  const principal = await requirePrincipal();
  const db = database();
  const sites = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = sites[0];
  if (!found || !can(principal, "form.read", { accountId: found.accountId })) {
    return new Response("Not found", { status: 404 });
  }
  const forms = await db.select().from(leadForm).where(eq(leadForm.siteId, siteId));
  const form = forms.find((item) => item.formKey === formKey);
  if (!form) return new Response("Not found", { status: 404 });
  const rows = await db.select().from(formSubmission).where(eq(formSubmission.leadFormId, form.id));
  const csv = toCsv(rows.map((row) => row.fields as Record<string, string>));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${formKey}.csv"`
    }
  });
}
