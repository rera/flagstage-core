import { csvEscape } from "@flagstage/forms";

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  full_name: "Name",
  fullName: "Name",
  email: "Email",
  email_address: "Email",
  phone: "Phone",
  message: "Message",
  note: "Note",
  day: "Day"
};

const FIELD_ORDER = [
  "name",
  "full_name",
  "fullName",
  "email",
  "email_address",
  "phone",
  "day",
  "message",
  "note"
];

function fieldText(fields: unknown, key: string): string {
  if (!fields || typeof fields !== "object") return "";
  const value = (fields as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function fieldLabel(key: string): string {
  const known = FIELD_LABEL[key];
  if (known) return known;
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Name when the submission has one, otherwise the email address. */
export function submissionFrom(fields: unknown): string {
  for (const key of ["name", "full_name", "fullName"]) {
    const value = fieldText(fields, key);
    if (value) return value;
  }
  for (const key of ["email", "email_address"]) {
    const value = fieldText(fields, key);
    if (value) return value;
  }
  return "Submission";
}

export function submissionEntries(
  fields: unknown
): Array<{ key: string; label: string; value: string }> {
  if (!fields || typeof fields !== "object") return [];
  const record = fields as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => {
    if (key === "website") return false;
    const value = record[key];
    if (typeof value === "string") return value.trim() !== "";
    return value != null && value !== "";
  });
  keys.sort((left, right) => {
    const leftAt = FIELD_ORDER.indexOf(left);
    const rightAt = FIELD_ORDER.indexOf(right);
    if (leftAt === -1 && rightAt === -1) return left.localeCompare(right);
    if (leftAt === -1) return 1;
    if (rightAt === -1) return -1;
    return leftAt - rightAt;
  });
  return keys.map((key) => ({
    key,
    label: fieldLabel(key),
    value: String(record[key]).trim()
  }));
}

export function notifyEmailList(value: string): string[] | null {
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const ok = parts.every((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
  return ok ? parts : null;
}

/** Empty clears the webhook. `null` means the value is not an https URL. */
export function notifyWebhook(value: string): string | null {
  const webhook = value.trim();
  if (!webhook) return "";
  if (!/^https:\/\/\S+$/.test(webhook)) return null;
  return webhook;
}

export function submissionsCsv(
  rows: Array<{ leadFormId: string; fields: unknown; createdAt: Date }>,
  forms: Array<{ id: string; name: string }>
): string {
  const names = new Map(forms.map((form) => [form.id, form.name]));
  const present = new Set<string>();
  for (const row of rows) {
    for (const entry of submissionEntries(row.fields)) present.add(entry.key);
  }
  const extras = [...present].filter((key) => !FIELD_ORDER.includes(key)).sort();
  const columns = [...FIELD_ORDER.filter((key) => present.has(key)), ...extras];
  const headers = ["From", "Form", "Received", ...columns];
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    const values = new Map(submissionEntries(row.fields).map((entry) => [entry.key, entry.value]));
    lines.push(
      [
        submissionFrom(row.fields),
        names.get(row.leadFormId) ?? "",
        row.createdAt.toISOString(),
        ...columns.map((key) => values.get(key) ?? "")
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function csvFilename(formKey: string | null): string {
  if (!formKey) return "submissions.csv";
  const safe = formKey.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "form"}.csv`;
}
