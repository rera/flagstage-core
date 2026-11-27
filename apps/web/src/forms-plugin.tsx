import type { ReactNode } from "react";

import { PageHeader, cn } from "@flagstage/ui";

import { Page } from "./page";
import { SiteIdentity } from "./site-nav";

const tabs = [
  { id: "submissions", path: "/plugins/forms", label: "Submissions" },
  { id: "settings", path: "/plugins/forms/settings", label: "Settings" }
] as const;

export type FormsPluginTab = (typeof tabs)[number]["id"];

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
