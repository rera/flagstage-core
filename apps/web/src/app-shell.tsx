"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Badge, Button, FlagstageMark, buttonVariants, cn } from "@flagstage/ui";

import { SIDEBAR_COOKIE, type SidebarIa } from "./account-cookie";
import { NavIcon } from "./nav-icon";
import { NewSiteDialog } from "./new-site-dialog";

function active(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SiteLink = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  section: "main" | "setup";
};

function siteItem(
  siteBase: string,
  label: string,
  icon: string,
  path: string,
  section: SiteLink["section"],
  exact = false
): SiteLink {
  return { href: path ? `${siteBase}${path}` : siteBase, label, icon, section, exact };
}

function siteAdminLinks(siteBase: string): SiteLink[] {
  return [
    siteItem(siteBase, "People", "people", "/people", "setup"),
    siteItem(siteBase, "Skills", "skills", "/skills", "setup"),
    siteItem(siteBase, "Domain", "domain", "/domain", "setup"),
    siteItem(siteBase, "Settings", "settings", "/settings", "setup")
  ];
}

function siteNav(
  ia: SidebarIa,
  siteBase: string,
  canAnalytics: boolean,
  hasSite: boolean
): SiteLink[] {
  if (!hasSite) return [];
  const overview = siteItem(siteBase, "Overview", "overview", "", "main", true);
  const forms = siteItem(siteBase, "Forms", "forms", "/forms", "main");
  const plugins = siteItem(siteBase, "Plugins", "plugins", "/plugins", "main");
  const analytics = siteItem(siteBase, "Analytics", "analytics", "/analytics", "main");
  const scheduled = siteItem(siteBase, "Scheduled", "scheduled", "/scheduled", "main");
  const admin = siteAdminLinks(siteBase);
  const work = ia === "current" ? forms : plugins;
  const everyday = [overview, work, ...(canAnalytics ? [analytics] : []), scheduled];
  if (ia === "settings") {
    return [...everyday, siteItem(siteBase, "Settings", "settings", "/settings", "main")];
  }
  if (ia === "setup" || ia === "menu") return [...everyday, ...admin];
  return [
    overview,
    ...admin.slice(0, 3).map((link) => ({ ...link, section: "main" as const })),
    forms,
    ...(canAnalytics ? [analytics] : []),
    scheduled,
    ...admin.slice(3).map((link) => ({ ...link, section: "main" as const }))
  ];
}

function onSitePath(pathname: string, siteBase: string, suffix: string) {
  return pathname === `${siteBase}${suffix}` || pathname.startsWith(`${siteBase}${suffix}/`);
}

function siteLinkCurrent(pathname: string, link: SiteLink, ia: SidebarIa, siteBase: string) {
  if (
    ia === "settings" &&
    link.label === "Settings" &&
    ["/people", "/skills", "/domain", "/settings"].some((suffix) =>
      onSitePath(pathname, siteBase, suffix)
    )
  ) {
    return true;
  }
  if (
    ia !== "current" &&
    link.label === "Plugins" &&
    ["/plugins", "/forms"].some((suffix) => onSitePath(pathname, siteBase, suffix))
  ) {
    return true;
  }
  return active(pathname, link.href, Boolean(link.exact));
}

function rememberCollapsed(next: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function initials(person: string) {
  const parts = person.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  const letters = last ? `${first[0] ?? ""}${last[0] ?? ""}` : first.slice(0, 2);
  return letters.toUpperCase();
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
  canAnalytics = true,
  showAccountNav = true,
  people = [],
  lastSlug,
  collapsed: collapsedInitially,
  backHref,
  ia = "current",
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
  canAnalytics?: boolean;
  showAccountNav?: boolean;
  people?: Array<{ id: string; name: string; email: string }>;
  lastSlug?: string | null;
  collapsed?: boolean;
  backHref?: string;
  ia?: SidebarIa;
  signOut: (formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const adminMode = pathname === "/admin" || pathname.startsWith("/admin/");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(Boolean(collapsedInitially));
  const [menu, setMenu] = useState<"account" | "site" | null>(null);
  const builder = /^\/(?:a\/[^/]+\/)?sites\/[^/]+\/edit/.test(pathname);
  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      root.classList.remove("nav-open");
      return;
    }
    root.classList.add("nav-open");
    return () => root.classList.remove("nav-open");
  }, [open]);
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
  const home = adminMode
    ? "/admin/accounts"
    : current
      ? `/a/${current.slug}`
      : admin
        ? "/admin/accounts"
        : "/sites";
  const rail = collapsed && !open;
  const siteBase = current && currentSite ? `/a/${current.slug}/sites/${currentSite.id}` : "";
  const siteLinks = siteNav(ia, siteBase, canAnalytics, Boolean(currentSite));
  const mainLinks = siteLinks.filter((link) => link.section === "main");
  const setupLinks = siteLinks.filter((link) => link.section === "setup");
  const menuLinks = currentSite ? siteAdminLinks(siteBase) : [];
  const setupInSidebar = ia === "setup" || (ia === "menu" && rail);
  const accountLinks =
    current && showAccountNav
      ? [
          { href: `/a/${current.slug}/sites`, label: "All sites", icon: "sites", exact: true },
          { href: `/a/${current.slug}/people`, label: "People", icon: "people" },
          { href: `/a/${current.slug}/skills`, label: "Skills", icon: "skills" },
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
          className="fixed inset-0 z-overlay h-dvh w-full md:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "fixed inset-y-0 left-0 z-overlay flex h-dvh max-h-dvh w-60 max-w-60 shrink-0 flex-col border-r border-border bg-[var(--wash)] md:static md:h-auto md:max-h-none",
          open ? "flex" : "hidden md:flex",
          collapsed ? "md:w-16 md:max-w-16" : "md:w-60"
        )}
      >
        <div className={cn("relative flex items-start gap-2.5 px-3 pt-4", rail && "md:px-2")}>
          <a href={home} className="mt-0.5 shrink-0" aria-label={name}>
            {logoSrc ? (
              <img src={logoSrc} alt="" width={36} height={36} className="size-9 rounded-[9px]" />
            ) : (
              <span className="grid size-9 place-items-center overflow-hidden rounded-[9px] bg-[#111620]">
                <FlagstageMark className="size-9" />
              </span>
            )}
          </a>
          <div className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", rail && "md:hidden")}>
            {adminMode ? (
              <>
                <p className="truncate px-0.5 text-sm font-semibold">Platform admin</p>
                <a
                  href={backHref || "/sites"}
                  onClick={close}
                  className="mt-0.5 inline-block px-0.5 text-[13px] font-medium text-primary"
                >
                  Back to sites
                </a>
              </>
            ) : current && showAccount ? (
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 px-0.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                aria-expanded={menu === "account"}
                aria-haspopup="listbox"
                aria-label={`Switch account, ${current.name}`}
                onClick={() => setMenu((value) => (value === "account" ? null : "account"))}
              >
                <span className="truncate">{current.name}</span>
                <span
                  aria-hidden
                  className="inline-block size-1.5 shrink-0 rotate-45 border-b border-r border-current"
                />
              </button>
            ) : current ? (
              <p className="truncate px-0.5 text-xs font-medium text-muted-foreground">
                {current.name}
              </p>
            ) : showAccount ? (
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 px-0.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                aria-expanded={menu === "account"}
                aria-haspopup="listbox"
                aria-label="Switch account, Choose an account"
                onClick={() => setMenu((value) => (value === "account" ? null : "account"))}
              >
                <span className="truncate">Choose an account</span>
                <span
                  aria-hidden
                  className="inline-block size-1.5 shrink-0 rotate-45 border-b border-r border-current"
                />
              </button>
            ) : (
              <p className="truncate px-0.5 text-sm font-semibold">{name}</p>
            )}
            {!adminMode && current && showSiteMenu ? (
              <button
                type="button"
                className="mt-0.5 flex w-full min-w-0 max-w-full flex-col items-start px-0.5 text-left hover:text-foreground"
                aria-expanded={menu === "site"}
                aria-haspopup="listbox"
                aria-label={`Switch site, ${siteLabel}`}
                onClick={() => setMenu((value) => (value === "site" ? null : "site"))}
              >
                <span className="flex w-full min-w-0 items-center gap-1.5 text-sm font-semibold">
                  {currentSite ? (
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        currentSite.status === "live" ? "bg-primary" : "bg-muted-foreground"
                      )}
                    />
                  ) : null}
                  <span className="min-w-0 truncate">{siteLabel}</span>
                </span>
                {currentSite ? (
                  <span className="mt-0.5 flex w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 pl-3">
                    <span
                      className="min-w-0 max-w-full truncate font-mono text-[11px] text-muted-foreground"
                      title={currentSite.host}
                    >
                      {currentSite.host}
                    </span>
                    <Badge
                      variant={currentSite.status === "live" ? "success" : "default"}
                      className="max-w-full shrink-0 whitespace-normal px-1.5 py-px text-center text-[10px] leading-tight"
                    >
                      {statusLabel(currentSite.status)}
                    </Badge>
                  </span>
                ) : null}
              </button>
            ) : !adminMode && current ? (
              <p className="mt-0.5 truncate px-0.5 text-sm font-semibold">{siteLabel}</p>
            ) : null}
          </div>
          {!adminMode && menu === "account" && showAccount ? (
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
          {!adminMode && menu === "site" && current ? (
            <div className="absolute top-full right-3 left-3 z-20 mt-1 max-h-[min(32rem,calc(100dvh-6.5rem))] overflow-auto rounded-xl border border-border bg-background p-1 shadow-sm">
              {ia === "settings" && currentSite ? (
                <nav aria-label="Account" className="px-1 pb-1">
                  <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                    {current.name}
                  </p>
                  {accountLinks.map((link) => {
                    const on = active(pathname, link.href, link.exact);
                    return (
                      <a
                        key={link.href}
                        href={link.href}
                        aria-current={on ? "page" : undefined}
                        onClick={close}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-[var(--wash)] hover:text-foreground",
                          on && "bg-[var(--wash)] font-semibold text-foreground"
                        )}
                      >
                        <NavIcon name={link.icon} />
                        {link.label}
                      </a>
                    );
                  })}
                </nav>
              ) : null}
              <ul
                role="listbox"
                aria-label="Sites"
                className={cn(
                  "max-h-80 overflow-auto",
                  ia === "settings" && currentSite && "border-t border-border"
                )}
              >
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
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">{item.name}</span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] font-medium",
                            item.status === "live" ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </span>
                      <span
                        className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground"
                        title={item.host}
                      >
                        {item.host}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              {ia === "menu" && currentSite ? (
                <nav aria-label="This site" className="border-t border-border px-1 pt-1">
                  <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                    This site
                  </p>
                  {menuLinks.map((link) => {
                    const on = siteLinkCurrent(pathname, link, ia, siteBase);
                    return (
                      <a
                        key={link.href}
                        href={link.href}
                        aria-current={on ? "page" : undefined}
                        onClick={close}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-[var(--wash)] hover:text-foreground",
                          on && "bg-[var(--wash)] font-semibold text-foreground"
                        )}
                      >
                        <NavIcon name={link.icon} />
                        {link.label}
                      </a>
                    );
                  })}
                </nav>
              ) : null}
              {canCreate ? (
                <div className="border-t border-border p-2">
                  <NewSiteDialog
                    accounts={[{ id: current.id, name: current.name }]}
                    people={people}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
          {!adminMode && currentSite && canEdit ? (
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
          {!adminMode && mainLinks.length > 0 ? (
            <nav className="flex flex-col gap-1" aria-label="Site">
              {mainLinks.map((link) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  icon={link.icon}
                  current={siteLinkCurrent(pathname, link, ia, siteBase)}
                  rail={rail}
                  onNavigate={close}
                />
              ))}
            </nav>
          ) : null}
          {!adminMode && setupInSidebar && setupLinks.length > 0 ? (
            <div>
              <p
                className={cn(
                  "px-3 pb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground",
                  rail && "md:sr-only"
                )}
              >
                SETUP
              </p>
              <nav className="flex flex-col gap-1" aria-label="Setup">
                {setupLinks.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                    current={siteLinkCurrent(pathname, link, ia, siteBase)}
                    rail={rail}
                    onNavigate={close}
                  />
                ))}
              </nav>
            </div>
          ) : null}
          {!adminMode && accountLinks.length > 0 && !(ia === "settings" && currentSite) ? (
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
            <nav className="flex flex-col gap-1" aria-label="Admin">
              {adminMode ? (
                adminLinks.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                    current={active(pathname, link.href, link.exact)}
                    rail={rail}
                    onNavigate={close}
                  />
                ))
              ) : (
                <NavLink
                  href="/admin/accounts"
                  label="Platform admin"
                  icon="platform"
                  current={false}
                  rail={rail}
                  onNavigate={close}
                />
              )}
            </nav>
          ) : null}
        </div>
        <div className="mt-auto border-t border-border p-3">
          <div className={cn("flex items-center gap-2", rail && "md:flex-col")}>
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full border border-border text-xs font-semibold",
                rail ? "md:grid" : "hidden"
              )}
              title={person || name}
            >
              {initials(person || name)}
            </span>
            <p className={cn("min-w-0 flex-1 truncate text-sm font-medium", rail && "md:sr-only")}>
              {person || name}
            </p>
            <button
              type="button"
              className="hidden size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:text-foreground md:inline-flex"
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
          </div>
          <form action={signOut} className="mt-1">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className={cn("w-full justify-start", rail && "md:justify-center md:px-0")}
              title="Sign out"
            >
              <span className={rail ? "md:sr-only" : undefined}>Sign out</span>
              <span
                className={cn("hidden text-base leading-none", rail && "md:inline")}
                aria-hidden
              >
                ↪
              </span>
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
            {adminMode
              ? "Platform admin"
              : current
                ? `${showAccount ? `${current.name} › ` : ""}${siteLabel}`
                : name}
          </span>
        </header>
        <main id="content" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
