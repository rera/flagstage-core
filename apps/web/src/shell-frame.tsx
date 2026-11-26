import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";

import { loadConfig } from "@flagstage/config";
import { can, loadGrants } from "@flagstage/core";
import { site, siteDomain } from "@flagstage/db";
import { eq, inArray } from "drizzle-orm";

import { ACCOUNT_COOKIE, SIDEBAR_COOKIE } from "./account-cookie";
import { AppShell, type ShellAccount, type ShellSite } from "./app-shell";
import { signOut } from "./actions";
import { currentSession } from "./auth";
import { accountHome, database, visibleAccounts } from "./guard";
import { ownerChoices } from "./roster";

export async function ShellFrame({ children }: { children: ReactNode }) {
  const session = await currentSession().catch(() => null);
  let name = "Flagstage";
  let logoSrc: string | null = null;
  try {
    const product = loadConfig().product;
    if (product) {
      name = product.brand.name || name;
      if (product.brand.logo) logoSrc = "/brand/logo";
    }
  } catch {
    // The shell still renders when configuration is incomplete.
  }
  let admin = false;
  let accounts: ShellAccount[] = [];
  let sites: ShellSite[] = [];
  let canCreate = false;
  let canEdit = false;
  let canAnalytics = true;
  let showAccountNav = true;
  let people: Array<{ id: string; name: string; email: string }> = [];
  let lastSlug: string | null = null;
  let collapsed = false;
  let backHref = "/sites";
  if (session?.user && process.env.NEXT_PHASE !== "phase-production-build") {
    try {
      const grants = await loadGrants(database(), session.user.id);
      const principal = {
        id: session.user.id,
        orgRole: grants.orgRole,
        disabled: grants.disabled,
        memberships: grants.memberships,
        siteGrants: grants.siteGrants
      };
      admin = grants.orgRole === "admin" && grants.disabled !== true;
      if (!grants.disabled) {
        const rows = await visibleAccounts(principal);
        accounts = rows
          .map((row) => ({ id: row.id, slug: row.slug, name: row.name }))
          .sort((left, right) => left.name.localeCompare(right.name));
      }
      const jar = await cookies();
      lastSlug = jar.get(ACCOUNT_COOKIE)?.value ?? null;
      collapsed = jar.get(SIDEBAR_COOKIE)?.value === "collapsed";
      const pathname = (await headers()).get("x-pathname") ?? "";
      const fromPath = pathname.match(/^\/a\/([^/]+)/)?.[1];
      const current =
        accounts.find((item) => item.slug === fromPath) ??
        accounts.find((item) => item.slug === lastSlug) ??
        (accounts.length === 1 ? accounts[0] : undefined);
      if (current) {
        showAccountNav = can(principal, "account.read", { accountId: current.id });
        canCreate = can(principal, "site.manage", { accountId: current.id });
        const siteId = pathname.match(/^\/a\/[^/]+\/sites\/([^/]+)/)?.[1];
        canEdit = siteId ? can(principal, "site.edit", { accountId: current.id, siteId }) : false;
        canAnalytics = siteId
          ? can(principal, "analytics.read", { accountId: current.id, siteId })
          : false;
        if (canCreate) people = await ownerChoices(database(), current.id, principal);
        const owned = (
          await database().select().from(site).where(eq(site.accountId, current.id))
        ).filter((row) => can(principal, "site.read", { accountId: current.id, siteId: row.id }));
        const domains =
          owned.length === 0
            ? []
            : await database()
                .select()
                .from(siteDomain)
                .where(
                  inArray(
                    siteDomain.siteId,
                    owned.map((row) => row.id)
                  )
                );
        sites = owned
          .map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            host:
              domains.find((item) => item.siteId === row.id)?.hostname ?? `${row.slug}.localhost`
          }))
          .sort((left, right) => left.name.localeCompare(right.name));
      }
      if (admin) {
        const backAccount = accounts.find((item) => item.slug === lastSlug) ?? accounts[0];
        if (backAccount) backHref = await accountHome(backAccount);
      }
    } catch {
      admin = false;
    }
  }
  const person = session?.user?.name || session?.user?.email || "";
  return (
    <AppShell
      name={name}
      logoSrc={logoSrc}
      person={person}
      admin={admin}
      accounts={accounts}
      sites={sites}
      canCreate={canCreate}
      canEdit={canEdit}
      canAnalytics={canAnalytics}
      showAccountNav={showAccountNav}
      people={people}
      lastSlug={lastSlug}
      collapsed={collapsed}
      backHref={backHref}
      signOut={signOut}
    >
      {children}
    </AppShell>
  );
}
