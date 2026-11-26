import { cookies } from "next/headers";

import { cn } from "@flagstage/ui";

import { IA_COOKIE, parseSidebarIa } from "./account-cookie";

const links = [
  { id: "people", path: "/people", label: "People" },
  { id: "skills", path: "/skills", label: "Skills" },
  { id: "domain", path: "/domain", label: "Domain" },
  { id: "settings", path: "/settings", label: "Settings" }
] as const;

export type SiteAdminSection = (typeof links)[number]["id"];

export async function SiteAdminNav({ base, current }: { base: string; current: SiteAdminSection }) {
  const jar = await cookies();
  if (parseSidebarIa(jar.get(IA_COOKIE)?.value) !== "settings") return null;
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
