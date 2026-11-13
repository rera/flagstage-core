import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import { can, loadGrants, hasAnyAccess, type Principal } from "@flagstage/core";
import { account, getDb, site } from "@flagstage/db";
import { eq, inArray } from "drizzle-orm";

import { ACCOUNT_COOKIE, parseSiteMemory, SITE_COOKIE } from "./account-cookie";
import { currentSession } from "./auth";

export async function requirePrincipal(): Promise<Principal & { email: string; name: string }> {
  const session = await currentSession();
  if (!session?.user) redirect("/sign-in");
  const grants = await loadGrants(getDb(loadConfig().DATABASE_URL), session.user.id);
  const principal = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    orgRole: grants.orgRole,
    disabled: grants.disabled,
    memberships: grants.memberships
  };
  if (!hasAnyAccess(principal)) redirect("/no-access");
  return principal;
}

export function database() {
  return getDb(loadConfig().DATABASE_URL);
}

export async function visibleAccounts(principal: Principal) {
  const db = database();
  if (principal.orgRole === "admin") return db.select().from(account);
  const ids = principal.memberships.map((membership) => membership.accountId);
  if (ids.length === 0) return [];
  return db.select().from(account).where(inArray(account.id, ids));
}

export async function accountHome(row: { id: string; slug: string }): Promise<string> {
  const sites = await database()
    .select({ id: site.id })
    .from(site)
    .where(eq(site.accountId, row.id));
  const remembered = parseSiteMemory((await cookies()).get(SITE_COOKIE)?.value).get(row.slug);
  if (remembered && sites.some((item) => item.id === remembered)) {
    return `/a/${row.slug}/sites/${remembered}`;
  }
  if (sites.length === 1 && sites[0]) return `/a/${row.slug}/sites/${sites[0].id}`;
  return `/a/${row.slug}/sites`;
}

export async function landingPath(principal: Principal): Promise<string> {
  const rows = await visibleAccounts(principal);
  const last = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  const remembered = last ? rows.find((row) => row.slug === last) : undefined;
  if (remembered) return accountHome(remembered);
  if (principal.orgRole === "admin") return "/admin/accounts";
  const first = [...rows].sort((left, right) => left.name.localeCompare(right.name))[0];
  if (first) return accountHome(first);
  return "/no-access";
}

export async function requireAccount(slug: string) {
  const principal = await requirePrincipal();
  const rows = await database().select().from(account).where(eq(account.slug, slug)).limit(1);
  const found = rows[0];
  if (!found || !can(principal, "account.read", { accountId: found.id })) notFound();
  return { principal, account: found };
}

export async function requireSite(accountSlug: string, siteId: string) {
  const scope = await requireAccount(accountSlug);
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found || found.accountId !== scope.account.id) notFound();
  if (!can(scope.principal, "site.read", { accountId: scope.account.id })) notFound();
  return { ...scope, site: found };
}

export async function viewerIsAdmin(): Promise<boolean> {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.APP_URL) {
    return false;
  }
  const session = await currentSession();
  if (!session?.user) return false;
  try {
    const grants = await loadGrants(database(), session.user.id);
    return grants.orgRole === "admin" && grants.disabled !== true;
  } catch {
    return false;
  }
}
