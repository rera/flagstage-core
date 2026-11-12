"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn, FlagstageMark } from "@flagstage/ui";

const LINKS = [
  { href: "/admin", label: "People", exact: true },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/sites", label: "Sites" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/settings", label: "Settings" }
];

function crumb(pathname: string) {
  const names: Record<string, string> = {
    accounts: "Accounts",
    sites: "Sites",
    usage: "Usage",
    settings: "Settings"
  };
  const parts = pathname.split("/").filter(Boolean).slice(1);
  const items = [{ href: "/admin", label: "Flagstage" }];
  if (parts.length === 0) return [...items, { href: "/admin", label: "People" }];
  let href = "/admin";
  for (const part of parts) {
    href += `/${part}`;
    items.push({ href, label: names[part] ?? part });
  }
  return items;
}

export function AdminShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const crumbs = crumb(pathname);
  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-[var(--wash)]">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <a
            href="/admin"
            className="inline-flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[#111620]">
              <FlagstageMark className="size-9" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] tracking-tight">Flagstage</span>
              <span className="mt-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground">
                ADMIN
              </span>
            </span>
          </a>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Admin">
          {LINKS.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-[10px] px-3 py-2 text-[14.5px] font-medium text-muted-foreground hover:bg-background hover:text-foreground",
                  active && "bg-background text-foreground shadow-sm"
                )}
              >
                {link.label}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">{footer}</div>
      </aside>
      <div id="content" className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b border-border px-6 text-sm text-muted-foreground">
          {crumbs.map((item, index) => (
            <span key={`${item.href}-${index}`} className="flex items-center gap-2">
              {index > 0 ? <span aria-hidden>›</span> : null}
              {index === crumbs.length - 1 ? (
                <span className="font-medium text-foreground">{item.label}</span>
              ) : (
                <a href={item.href} className="hover:text-foreground">
                  {item.label}
                </a>
              )}
            </span>
          ))}
        </header>
        <div className="mx-auto w-full max-w-5xl px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
