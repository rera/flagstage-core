export const MEMBERSHIP_ROLES = ["account_admin", "member"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ORG_ROLES = ["admin", "none"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ACTIONS = [
  "org.manage",
  "account.read",
  "account.manage",
  "member.manage",
  "site.read",
  "site.manage",
  "site.edit",
  "site.publish",
  "site.comment",
  "domain.manage",
  "form.read",
  "form.manage"
] as const;
export type Action = (typeof ACTIONS)[number];

export type MembershipGrant = {
  accountId: string;
  role: MembershipRole;
};

export type Principal = {
  id: string;
  orgRole: OrgRole;
  disabled?: boolean;
  memberships: MembershipGrant[];
};

export type Resource = {
  accountId?: string;
};

const ACCOUNT_ADMIN: ReadonlySet<Action> = new Set([
  "account.read",
  "account.manage",
  "member.manage",
  "site.read",
  "site.manage",
  "site.edit",
  "site.publish",
  "site.comment",
  "domain.manage",
  "form.read",
  "form.manage"
]);

const MEMBER: ReadonlySet<Action> = new Set(["account.read", "site.read", "form.read"]);

const ROLE_ACTIONS: Record<MembershipRole, ReadonlySet<Action>> = {
  account_admin: ACCOUNT_ADMIN,
  member: MEMBER
};

/**
 * An org admin can do every action, including promoting another admin.
 * An account admin can do every action inside the accounts they belong to.
 * A member can read that account's sites, people, and usage.
 */
export function can(user: Principal, action: Action, resource: Resource = {}): boolean {
  if (user.disabled) return false;
  if (user.orgRole === "admin") return true;
  if (action === "org.manage") return false;
  if (!resource.accountId) return false;
  const grant = user.memberships.find((membership) => membership.accountId === resource.accountId);
  if (!grant) return false;
  return ROLE_ACTIONS[grant.role]?.has(action) ?? false;
}

export function hasAnyAccess(user: Principal): boolean {
  if (user.disabled) return false;
  if (user.orgRole === "admin") return true;
  return user.memberships.some((membership) =>
    (MEMBERSHIP_ROLES as readonly string[]).includes(membership.role)
  );
}
