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
import { database, visibleAccounts } from "./guard";

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
  let lastSlug: string | null = null;
  let collapsed = false;
  if (session?.user && process.env.NEXT_PHASE !== "phase-production-build") {
    try {
      const grants = await loadGrants(database(), session.user.id);
      const principal = {
        id: session.user.id,
        orgRole: grants.orgRole,
        disabled: grants.disabled,
        memberships: grants.memberships
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
        canCreate = can(principal, "site.manage", { accountId: current.id });
        canEdit = can(principal, "site.edit", { accountId: current.id });
        const owned = await database().select().from(site).where(eq(site.accountId, current.id));
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
      lastSlug={lastSlug}
      collapsed={collapsed}
      signOut={signOut}
    >
      {children}
    </AppShell>
  );
}
