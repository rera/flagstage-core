"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Button, FlagstageMark, cn } from "@flagstage/ui";

function active(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  name,
  logoSrc,
  person,
  admin,
  signOut,
  children
}: {
  name: string;
  logoSrc?: string | null;
  person: string;
  admin: boolean;
  signOut: (formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const builder = /^\/sites\/[^/]+\/edit/.test(pathname);
  if (builder) {
    return (
      <main id="content" className="min-h-dvh bg-background">
        {children}
      </main>
    );
  }
  const primary = [
    { href: "/sites", label: "Sites" },
    { href: "/accounts", label: "Accounts" }
  ];
  const adminLinks = [
    { href: "/admin", label: "People", exact: true },
    { href: "/admin/usage", label: "Usage" },
    { href: "/admin/settings", label: "Settings" }
  ];
  return (
    <div className="flex min-h-dvh bg-background">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-overlay bg-[#111620]/30 md:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-overlay flex w-60 flex-col border-r border-border bg-[var(--wash)] md:static",
          open ? "flex" : "hidden md:flex"
        )}
      >
        <div className="flex h-14 items-center px-4">
          <a
            href="/sites"
            className="inline-flex items-center gap-2.5 font-semibold tracking-tight"
          >
            {logoSrc ? (
              <img src={logoSrc} alt="" width={36} height={36} className="size-9 rounded-[9px]" />
            ) : (
              <span className="grid size-9 place-items-center overflow-hidden rounded-[9px] bg-[#111620]">
                <FlagstageMark className="size-9" />
              </span>
            )}
            <span className="truncate text-[15px]">{name}</span>
          </a>
        </div>
        <nav className="flex flex-col gap-1 px-3" aria-label="Primary">
          {primary.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-background hover:text-foreground",
                active(pathname, link.href) &&
                  "bg-background font-semibold text-foreground shadow-sm"
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>
        {admin ? (
          <div className="mt-6 px-3">
            <p className="px-3 pb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground">
              ADMIN
            </p>
            <nav className="flex flex-col gap-1" aria-label="Admin">
              {adminLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-background hover:text-foreground",
                    active(pathname, link.href, link.exact) &&
                      "bg-background font-semibold text-foreground shadow-sm"
                  )}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        ) : null}
        <div className="mt-auto border-t border-border p-3">
          <p className="truncate px-3 pb-1 text-sm font-medium">{person || name}</p>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-border px-4 md:hidden">
          <button
            type="button"
            className="h-8 rounded-md border border-border px-2.5 text-sm"
            aria-expanded={open}
            aria-label="Menu"
            onClick={() => setOpen((value) => !value)}
          >
            Menu
          </button>
          <span className="truncate text-sm font-semibold">{name}</span>
        </header>
        <main id="content" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
