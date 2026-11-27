import { csvFilename, submissionsCsv } from "../../../../../../../../../src/forms-submissions";
import { loadFormsPlugin } from "../../../../../../../../../src/forms-data";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ accountSlug: string; siteId: string }> }
) {
  const { accountSlug, siteId } = await context.params;
  const { forms, submissions } = await loadFormsPlugin(accountSlug, siteId);
  const formKey = new URL(request.url).searchParams.get("form") ?? "";
  const selected = forms.find((form) => form.formKey === formKey);
  const rows = selected ? submissions.filter((row) => row.leadFormId === selected.id) : submissions;
  const csv = submissionsCsv(rows, forms);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(selected?.formKey ?? null)}"`
    }
  });
}
