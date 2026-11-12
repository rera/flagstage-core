export const MEMBERSHIP_ROLES = ["account_admin", "editor", "reviewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ORG_ROLES = ["org_admin", "none"] as const;
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

const EDITOR: ReadonlySet<Action> = new Set([
  "account.read",
  "site.read",
  "site.edit",
  "site.publish",
  "site.comment",
  "form.read"
]);

const REVIEWER: ReadonlySet<Action> = new Set([
  "account.read",
  "site.read",
  "site.comment",
  "form.read"
]);

function roleAllows(role: MembershipRole, action: Action): boolean {
  if (role === "account_admin") return ACCOUNT_ADMIN.has(action);
  if (role === "editor") return EDITOR.has(action);
  return REVIEWER.has(action);
}

/**
 * Single authorization check. Organization admins can do everything.
 * Other roles are limited to accounts they belong to.
 * A disabled or unmapped user can do nothing.
 */
export function can(user: Principal, action: Action, resource: Resource = {}): boolean {
  if (user.disabled) return false;
  if (user.orgRole === "org_admin") return true;
  if (action === "org.manage") return false;
  if (!resource.accountId) return false;
  const grant = user.memberships.find((membership) => membership.accountId === resource.accountId);
  if (!grant) return false;
  return roleAllows(grant.role, action);
}

export function hasAnyAccess(user: Principal): boolean {
  if (user.disabled) return false;
  if (user.orgRole === "org_admin") return true;
  return user.memberships.length > 0;
}
