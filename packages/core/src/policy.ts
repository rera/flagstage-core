export const MEMBERSHIP_ROLES = ["account_admin"] as const;
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

/**
 * Two roles. An admin can do everything, including promoting another person
 * to admin. An account admin can do everything inside the accounts they
 * belong to, including members and invites. A third membership role is not
 * used: account access is the account-admin grant.
 */
export function can(user: Principal, action: Action, resource: Resource = {}): boolean {
  if (user.disabled) return false;
  if (user.orgRole === "admin") return true;
  if (action === "org.manage") return false;
  if (!resource.accountId) return false;
  const grant = user.memberships.find((membership) => membership.accountId === resource.accountId);
  if (!grant || grant.role !== "account_admin") return false;
  return ACCOUNT_ADMIN.has(action);
}

export function hasAnyAccess(user: Principal): boolean {
  if (user.disabled) return false;
  if (user.orgRole === "admin") return true;
  return user.memberships.some((membership) => membership.role === "account_admin");
}
