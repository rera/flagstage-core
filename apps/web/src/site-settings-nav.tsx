import { redirect } from "next/navigation";

import { cn } from "@flagstage/ui";

import { settingsTabPath } from "./site-settings-path";

const links = [
  { id: "people", path: "/settings/people", label: "People" },
  { id: "skills", path: "/settings/skills", label: "Skills" },
  { id: "domain", path: "/settings/domain", label: "Domain" },
  { id: "settings", path: "/settings", label: "Settings" }
] as const;

export type SiteSettingsTab = (typeof links)[number]["id"];

export function redirectToSettingsTab(
  accountSlug: string,
  siteId: string,
  tab: Exclude<SiteSettingsTab, "settings">,
  query: Record<string, string | string[] | undefined> = {}
): never {
  redirect(settingsTabPath(accountSlug, siteId, tab, query));
}

export function SiteSettingsNav({ base, current }: { base: string; current: SiteSettingsTab }) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Settings">
      {links.map((link) => {
        const on = link.id === current;
        return (
          <a
            key={link.id}
            href={`${base}${link.path}`}
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
  );
}
