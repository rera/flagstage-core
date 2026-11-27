import { csvEscape } from "@flagstage/forms";

import { loadFormsPlugin } from "../../../../../../../../../src/forms-data";
import { submissionFrom } from "../../../../../../../../../src/forms-plugin";

const FIELD_ORDER = ["name", "email", "phone", "day", "message", "note"];

function fieldRecord(fields: unknown): Record<string, string> {
  if (!fields || typeof fields !== "object") return {};
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (key === "website") continue;
    if (typeof value !== "string" || value.trim() === "") continue;
    record[key] = value.trim();
  }
  return record;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ accountSlug: string; siteId: string }> }
) {
  const { accountSlug, siteId } = await context.params;
  const { forms, submissions } = await loadFormsPlugin(accountSlug, siteId);
  const formKey = new URL(request.url).searchParams.get("form") ?? "";
  const selected = forms.find((form) => form.formKey === formKey);
  const rows = selected ? submissions.filter((row) => row.leadFormId === selected.id) : submissions;
  const names = new Map(forms.map((form) => [form.id, form.name]));
  const extras = [
    ...new Set(
      rows.flatMap((row) =>
        Object.keys(fieldRecord(row.fields)).filter((key) => !FIELD_ORDER.includes(key))
      )
    )
  ].sort();
  const headers = ["From", "Form", "Received", ...FIELD_ORDER, ...extras];
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    const fields = fieldRecord(row.fields);
    const values = [
      submissionFrom(row.fields),
      names.get(row.leadFormId) ?? "",
      row.createdAt.toISOString(),
      ...FIELD_ORDER.map((key) => fields[key] ?? ""),
      ...extras.map((key) => fields[key] ?? "")
    ];
    lines.push(values.map(csvEscape).join(","));
  }
  const filename = selected ? `${selected.formKey}.csv` : "submissions.csv";
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}
