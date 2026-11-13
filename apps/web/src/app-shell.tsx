"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Button, FlagstageMark, buttonVariants, cn } from "@flagstage/ui";

import { SIDEBAR_COOKIE } from "./account-cookie";
import { NavIcon } from "./nav-icon";
import { NewSiteDialog } from "./new-site-dialog";

function active(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function rememberCollapsed(next: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export type ShellAccount = { id: string; slug: string; name: string };
export type ShellSite = { id: string; name: string; status: string; host: string };

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "importing") return "Importing";
  if (status === "preview") return "Draft";
  if (status === "failed") return "Didn't finish";
  return status;
}

function NavLink({
  href,
  label,
  icon,
  current,
  rail,
  onNavigate
}: {
  href: string;
  label: string;
  icon: string;
  current: boolean;
  rail: boolean;
  onNavigate: () => void;
}) {
  return (
    <a
      href={href}
      aria-current={current ? "page" : undefined}
      title={rail ? label : undefined}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-background hover:text-foreground",
        rail && "md:justify-center md:px-0",
        current && "bg-background font-semibold text-foreground shadow-sm"
      )}
    >
      <NavIcon name={icon} />
      <span className={rail ? "md:sr-only" : undefined}>{label}</span>
      {rail ? (
        <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden -translate-y-1/2 rounded-md bg-[#111620] px-2 py-1 text-xs font-medium whitespace-nowrap text-white group-hover:md:block group-focus-visible:md:block">
          {label}
        </span>
      ) : null}
    </a>
  );
}

export function AppShell({
  name,
  logoSrc,
  person,
  admin,
  accounts,
  sites,
  canCreate,
  canEdit,
  lastSlug,
  collapsed: collapsedInitially,
  signOut,
  children
}: {
  name: string;
  logoSrc?: string | null;
  person: string;
  admin: boolean;
  accounts: ShellAccount[];
  sites: ShellSite[];
  canCreate: boolean;
  canEdit: boolean;
  lastSlug?: string | null;
  collapsed?: boolean;
  signOut: (formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(Boolean(collapsedInitially));
  const [menu, setMenu] = useState<"account" | "site" | null>(null);
  const builder = /^\/(?:a\/[^/]+\/)?sites\/[^/]+\/edit/.test(pathname);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      setCollapsed((value) => {
        rememberCollapsed(!value);
        return !value;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (builder) {
    return (
      <main id="content" className="min-h-dvh bg-background">
        {children}
      </main>
    );
  }
  const fromPath = pathname.match(/^\/a\/([^/]+)/)?.[1];
  const current =
    accounts.find((item) => item.slug === fromPath) ??
    accounts.find((item) => item.slug === lastSlug) ??
    (accounts.length === 1 ? accounts[0] : undefined);
  const siteId = pathname.match(/^\/a\/[^/]+\/sites\/([^/]+)/)?.[1];
  const currentSite = sites.find((item) => item.id === siteId);
  const showAccount = admin ? accounts.length > 0 : accounts.length >= 2;
  const showSiteMenu = Boolean(current) && (sites.length >= 2 || canCreate);
  const home = current ? `/a/${current.slug}` : admin ? "/admin/accounts" : "/sites";
  const siteBase = current && currentSite ? `/a/${current.slug}/sites/${currentSite.id}` : "";
  const siteLinks = currentSite
    ? [
        { href: siteBase, label: "Overview", icon: "overview", exact: true },
        { href: `${siteBase}/domain`, label: "Domain", icon: "domain" },
        { href: `${siteBase}/forms`, label: "Forms", icon: "forms" },
        { href: `${siteBase}/analytics`, label: "Analytics", icon: "analytics" },
        { href: `${siteBase}/scheduled`, label: "Scheduled", icon: "scheduled" },
        { href: `${siteBase}/settings`, label: "Settings", icon: "settings" }
      ]
    : [];
  const accountLinks = current
    ? [
        { href: `/a/${current.slug}/sites`, label: "All sites", icon: "sites", exact: true },
        { href: `/a/${current.slug}/people`, label: "People", icon: "people" },
        { href: `/a/${current.slug}/usage`, label: "Usage", icon: "usage" }
      ]
    : [];
  const adminLinks = [
    { href: "/admin/accounts", label: "Accounts", icon: "accounts" },
    { href: "/admin/sites", label: "Sites", icon: "sites" },
    { href: "/admin", label: "People", icon: "people", exact: true },
    { href: "/admin/usage", label: "Usage", icon: "usage" },
    { href: "/admin/settings", label: "Settings", icon: "settings" }
  ];
  const rail = collapsed && !open;
  const siteLabel = currentSite?.name ?? "All sites";
  const close = () => {
    setOpen(false);
    setMenu(null);
  };
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
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "fixed inset-y-0 left-0 z-overlay flex w-60 flex-col border-r border-border bg-[var(--wash)] md:static",
          open ? "flex" : "hidden md:flex",
          collapsed ? "md:w-16" : "md:w-60"
        )}
      >
        <div className="relative flex items-start gap-2 px-3 pt-3">
          <a href={home} className="mt-0.5 shrink-0" aria-label={name}>
            {logoSrc ? (
              <img src={logoSrc} alt="" width={36} height={36} className="size-9 rounded-[9px]" />
            ) : (
              <span className="grid size-9 place-items-center overflow-hidden rounded-[9px] bg-[#111620]">
                <FlagstageMark className="size-9" />
              </span>
            )}
          </a>
          <div className={cn("flex min-w-0 flex-1 flex-col", rail && "md:hidden")}>
            {showAccount ? (
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 rounded-[10px] px-1.5 py-1 text-left text-sm font-semibold hover:bg-background"
                aria-expanded={menu === "account"}
                aria-haspopup="listbox"
                aria-label={
                  current ? `Switch account, ${current.name}` : "Switch account, Choose an account"
                }
                onClick={() => setMenu((value) => (value === "account" ? null : "account"))}
              >
                <span className="truncate">{current?.name ?? "Choose an account"}</span>
                <span
                  aria-hidden
                  className="inline-block size-1.5 shrink-0 rotate-45 border-b border-r border-current"
                />
              </button>
            ) : null}
            {current && showSiteMenu ? (
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 rounded-[10px] px-1.5 py-1 text-left text-sm font-semibold hover:bg-background"
                aria-expanded={menu === "site"}
                aria-haspopup="listbox"
                aria-label={`Switch site, ${siteLabel}`}
                onClick={() => setMenu((value) => (value === "site" ? null : "site"))}
              >
                {showAccount ? (
                  <span aria-hidden className="text-muted-foreground">
                    ›
                  </span>
                ) : null}
                <span className="truncate">{siteLabel}</span>
                <span
                  aria-hidden
                  className="inline-block size-1.5 shrink-0 rotate-45 border-b border-r border-current"
                />
              </button>
            ) : current ? (
              <span className="flex min-w-0 items-center gap-1 px-1.5 py-1 text-sm font-semibold">
                {showAccount ? (
                  <span aria-hidden className="text-muted-foreground">
                    ›
                  </span>
                ) : null}
                <span className="truncate">{siteLabel}</span>
              </span>
            ) : !showAccount ? (
              <span className="truncate px-1.5 py-1 text-sm font-semibold">{name}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="mt-0.5 hidden size-8 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-background hover:text-foreground md:inline-flex"
            aria-pressed={collapsed}
            aria-keyshortcuts="Control+B Meta+B"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => {
              setCollapsed((value) => {
                rememberCollapsed(!value);
                return !value;
              });
            }}
          >
            <NavIcon name={collapsed ? "expand" : "collapse"} />
          </button>
          {menu === "account" && showAccount ? (
            <ul
              role="listbox"
              aria-label="Accounts"
              className="absolute top-full right-3 left-3 z-20 mt-1 rounded-xl border border-border bg-background p-1 shadow-sm"
            >
              {accounts.map((item) => (
                <li key={item.slug}>
                  <a
                    href={`/a/${item.slug}`}
                    role="option"
                    aria-selected={item.slug === current?.slug}
                    onClick={close}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--wash)]",
                      item.slug === current?.slug && "bg-[var(--wash)] font-semibold"
                    )}
                  >
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {menu === "site" && current ? (
            <div className="absolute top-full right-3 left-3 z-20 mt-1 rounded-xl border border-border bg-background p-1 shadow-sm">
              <ul role="listbox" aria-label="Sites" className="max-h-80 overflow-auto">
                {sites.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`/a/${current.slug}/sites/${item.id}`}
                      role="option"
                      aria-selected={item.id === currentSite?.id}
                      onClick={close}
                      className={cn(
                        "block rounded-lg px-3 py-2 hover:bg-[var(--wash)]",
                        item.id === currentSite?.id && "bg-[var(--wash)]"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{item.name}</span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] font-medium",
                            item.status === "live" ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                        {item.host}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              {canCreate ? (
                <div className="border-t border-border p-2">
                  <NewSiteDialog accounts={[{ id: current.id, name: current.name }]} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
          {currentSite && canEdit ? (
            <a
              href={`${siteBase}/edit`}
              onClick={close}
              title={rail ? "Make changes" : undefined}
              className={cn(buttonVariants(), "group relative w-full", rail && "md:w-9 md:px-0")}
            >
              <NavIcon name="changes" />
              <span className={rail ? "md:sr-only" : undefined}>Make changes</span>
            </a>
          ) : null}
          {siteLinks.length > 0 ? (
            <nav className="flex flex-col gap-1" aria-label="Site">
              {siteLinks.map((link) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  icon={link.icon}
                  current={active(pathname, link.href, link.exact)}
                  rail={rail}
                  onNavigate={close}
                />
              ))}
            </nav>
          ) : null}
          {accountLinks.length > 0 ? (
            <div>
              <p
                className={cn(
                  "px-3 pb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground",
                  rail && "md:sr-only"
                )}
              >
                ACCOUNT
              </p>
              <nav className="flex flex-col gap-1" aria-label="Account">
                {accountLinks.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                    current={active(pathname, link.href, link.exact)}
                    rail={rail}
                    onNavigate={close}
                  />
                ))}
              </nav>
            </div>
          ) : null}
          {admin ? (
            <div>
              <p
                className={cn(
                  "px-3 pb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground",
                  rail && "md:sr-only"
                )}
              >
                ADMIN
              </p>
              <nav className="flex flex-col gap-1" aria-label="Admin">
                {adminLinks.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                    current={active(pathname, link.href, link.exact)}
                    rail={rail}
                    onNavigate={close}
                  />
                ))}
              </nav>
            </div>
          ) : null}
        </div>
        <div className="mt-auto border-t border-border p-3">
          <p className={cn("truncate px-3 pb-1 text-sm font-medium", rail && "md:sr-only")}>
            {person || name}
          </p>
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className={cn("w-full justify-start", rail && "md:justify-center md:px-0")}
              title={rail ? "Sign out" : undefined}
            >
              <span className={rail ? "md:sr-only" : undefined}>Sign out</span>
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
          <span className="truncate text-sm font-semibold">
            {current ? `${showAccount ? `${current.name} › ` : ""}${siteLabel}` : name}
          </span>
        </header>
        <main id="content" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
