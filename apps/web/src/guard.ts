import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import { loadGrants, hasAnyAccess, type Principal } from "@flagstage/core";
import { getDb } from "@flagstage/db";

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
