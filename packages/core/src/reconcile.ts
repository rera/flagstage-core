import type { MembershipRole, OrgRole } from "./policy";

export type GrantSource = "manual" | "scim" | "sso_claim" | "bootstrap";

export type GroupMapping = {
  providerId: string;
  groupExternalId: string;
  target: string;
  role: string;
};

export type StoredMembership = {
  accountId: string;
  role: MembershipRole;
  source: GrantSource;
};

export type Projection = {
  orgRole: OrgRole;
  memberships: Array<{ accountId: string; role: MembershipRole }>;
};

const MEMBERSHIP_ROLE = new Set<MembershipRole>(["account_admin", "editor", "reviewer"]);

function asMembershipRole(role: string): MembershipRole | null {
  return MEMBERSHIP_ROLE.has(role as MembershipRole) ? (role as MembershipRole) : null;
}

/** Stronger account roles win when two groups map the same account. */
const RANK: Record<MembershipRole, number> = {
  reviewer: 1,
  editor: 2,
  account_admin: 3
};

/**
 * Map immutable group ids through idp_group_mapping.
 * Display names are never consulted.
 */
export function projectGroups(
  providerId: string,
  groupIds: readonly string[],
  mappings: readonly GroupMapping[]
): Projection {
  const ids = new Set(groupIds);
  let orgRole: OrgRole = "none";
  const byAccount = new Map<string, MembershipRole>();
  for (const mapping of mappings) {
    if (mapping.providerId !== providerId) continue;
    if (!ids.has(mapping.groupExternalId)) continue;
    if (mapping.target === "org" && mapping.role === "org_admin") {
      orgRole = "org_admin";
      continue;
    }
    const role = asMembershipRole(mapping.role);
    if (!role || mapping.target === "org") continue;
    const current = byAccount.get(mapping.target);
    if (!current || RANK[role] > RANK[current]) {
      byAccount.set(mapping.target, role);
    }
  }
  return {
    orgRole,
    memberships: [...byAccount.entries()].map(([accountId, role]) => ({ accountId, role }))
  };
}

export type ReconcileInput = {
  source: "scim" | "sso_claim";
  active: boolean;
  currentOrgRole: OrgRole;
  currentOrgRoleSource: GrantSource | "none";
  memberships: readonly StoredMembership[];
  projected: Projection;
};

export type ReconcileResult = {
  orgRole: OrgRole;
  orgRoleSource: GrantSource | "none";
  memberships: StoredMembership[];
  clearSessions: boolean;
};

/**
 * Replace grants from the same source. Manual and bootstrap grants stay.
 * A deactivated user loses every membership, the organization role, and sessions.
 */
export function reconcileGrants(input: ReconcileInput): ReconcileResult {
  if (!input.active) {
    return {
      orgRole: "none",
      orgRoleSource: "none",
      memberships: [],
      clearSessions: true
    };
  }

  const kept = input.memberships.filter((membership) => membership.source !== input.source);
  const replaced: StoredMembership[] = input.projected.memberships.map((membership) => ({
    accountId: membership.accountId,
    role: membership.role,
    source: input.source
  }));
  const manualAccounts = new Set(
    kept
      .filter((membership) => membership.source === "manual" || membership.source === "bootstrap")
      .map((m) => m.accountId)
  );
  const memberships = [
    ...kept,
    ...replaced.filter((membership) => !manualAccounts.has(membership.accountId))
  ];

  const sourceOwnsOrg =
    input.currentOrgRoleSource === input.source || input.currentOrgRoleSource === "none";
  const manualOrg =
    input.currentOrgRole === "org_admin" &&
    (input.currentOrgRoleSource === "manual" || input.currentOrgRoleSource === "bootstrap");

  let orgRole = input.currentOrgRole;
  let orgRoleSource = input.currentOrgRoleSource;
  if (manualOrg) {
    orgRole = "org_admin";
    orgRoleSource = input.currentOrgRoleSource;
  } else if (sourceOwnsOrg) {
    orgRole = input.projected.orgRole;
    orgRoleSource = input.projected.orgRole === "org_admin" ? input.source : "none";
  }

  return { orgRole, orgRoleSource, memberships, clearSessions: false };
}
