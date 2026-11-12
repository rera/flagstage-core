import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import { hasAnyAccess, loadGrants, type Principal } from "@flagstage/core";
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
