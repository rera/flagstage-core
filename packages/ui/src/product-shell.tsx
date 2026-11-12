"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppBrand } from "./app-brand";
import { cn } from "./cn";

export type ShellLink = { href: string; label: string };

function active(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProductShell({
  name,
  logoSrc,
  links,
  trailing,
  children
}: {
  name: string;
  logoSrc?: string | null;
  links: ShellLink[];
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-sticky border-b border-border/80 bg-background">
        <div className="mx-auto flex h-[60px] max-w-[1280px] items-center gap-2 px-4 sm:gap-3 sm:px-5">
          <AppBrand variant="header" name={name} logoSrc={logoSrc} />
          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-[10px] px-3 py-2 text-[14.5px] font-medium text-muted-foreground hover:bg-[var(--wash)] hover:text-foreground",
                  active(pathname, link.href) && "bg-[var(--wash)] font-semibold text-foreground"
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {trailing}
            <button
              type="button"
              className="h-8 rounded-md border border-border px-2.5 text-sm md:hidden"
              aria-expanded={open}
              aria-label="Menu"
              onClick={() => setOpen((value) => !value)}
            >
              Menu
            </button>
          </div>
        </div>
        {open ? (
          <nav
            className="border-t border-border bg-background px-3 py-2 md:hidden"
            aria-label="Primary"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-[var(--wash)]"
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}
      </header>
      <main id="content" className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
