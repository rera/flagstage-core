import type { ReactNode } from "react";

import { cn } from "@flagstage/ui";

import { Page } from "./page";

const links = [
  { id: "install", href: "/admin/settings", label: "This install" },
  { id: "importer", href: "/admin/settings/importer", label: "Importer" },
  { id: "editor", href: "/admin/settings/editor", label: "Editor" }
] as const;

export type SettingsTab = (typeof links)[number]["id"];

export function SettingsPage({
  current,
  description,
  children
}: {
  current: SettingsTab;
  description: string;
  children: ReactNode;
}) {
  return (
    <Page>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      <nav className="flex flex-wrap gap-1" aria-label="Settings">
        {links.map((link) => {
          const on = link.id === current;
          return (
            <a
              key={link.id}
              href={link.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground",
                on && "bg-[var(--wash)] font-semibold text-foreground"
              )}
            >
              {link.label}
            </a>
          );
        })}
      </nav>
      <div className="space-y-8">{children}</div>
    </Page>
  );
}
