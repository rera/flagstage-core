import type { ReactNode } from "react";

import { PageHeader, cn } from "@flagstage/ui";

import { Page } from "./page";
import { SiteIdentity } from "./site-nav";

const tabs = [
  { id: "submissions", path: "/plugins/forms", label: "Submissions" },
  { id: "settings", path: "/plugins/forms/settings", label: "Settings" }
] as const;

export type FormsPluginTab = (typeof tabs)[number]["id"];

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
    if (leftAt === -1 && rightAt === -1) return 0;
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

export function FormsPluginFrame({
  site,
  base,
  current,
  children
}: {
  site: { name: string; status: string; slug: string };
  base: string;
  current: FormsPluginTab;
  children: ReactNode;
}) {
  return (
    <Page>
      <SiteIdentity name={site.name} status={site.status} host={`${site.slug}.localhost`} />
      <div>
        <a href={`${base}/plugins`} className="text-sm font-medium text-primary">
          Plugins
        </a>
        <div className="mt-3">
          <PageHeader level={2} title="Forms" description="Submissions from forms on this site." />
        </div>
      </div>
      <nav className="flex flex-wrap gap-1" aria-label="Forms">
        {tabs.map((tab) => {
          const on = tab.id === current;
          return (
            <a
              key={tab.id}
              href={`${base}${tab.path}`}
              aria-current={on ? "page" : undefined}
              className={cn(
                "rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground",
                on && "bg-[var(--wash)] font-semibold text-foreground"
              )}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>
      {children}
    </Page>
  );
}
