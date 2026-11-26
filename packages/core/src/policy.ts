export const MEMBERSHIP_ROLES = ["account_admin", "member"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const SITE_ROLES = ["owner", "editor", "viewer", "analyst"] as const;
export type SiteRole = (typeof SITE_ROLES)[number];

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
  "site.people",
  "domain.manage",
  "form.read",
  "form.manage",
  "skill.read",
  "skill.edit",
  "analytics.read"
] as const;
export type Action = (typeof ACTIONS)[number];

export type MembershipGrant = {
  accountId: string;
  role: MembershipRole;
};

export type SiteGrant = {
  siteId: string;
  accountId: string;
  role: SiteRole;
};

export type Principal = {
  id: string;
  orgRole: OrgRole;
  disabled?: boolean;
  memberships: MembershipGrant[];
  /** Omitted on older callers. Treated as no site roles. */
  siteGrants?: SiteGrant[];
};

export type Resource = {
  accountId?: string;
  siteId?: string;
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
  "site.people",
  "domain.manage",
  "form.read",
  "form.manage",
  "skill.read",
  "skill.edit",
  "analytics.read"
]);

const MEMBER: ReadonlySet<Action> = new Set([
  "account.read",
  "site.read",
  "form.read",
  "skill.read",
  "analytics.read"
]);

const ROLE_ACTIONS: Record<MembershipRole, ReadonlySet<Action>> = {
  account_admin: ACCOUNT_ADMIN,
  member: MEMBER
};

/** Owner runs the site. Editor changes and publishes it. Viewer is read-only. Analyst adds stats. */
const SITE_ROLE_ACTIONS: Record<SiteRole, ReadonlySet<Action>> = {
  owner: new Set([
    "site.read",
    "site.edit",
    "site.publish",
    "site.comment",
    "site.people",
    "domain.manage",
    "form.read",
    "skill.read",
    "skill.edit",
    "analytics.read"
  ]),
  editor: new Set([
    "site.read",
    "site.edit",
    "site.publish",
    "site.comment",
    "form.read",
    "skill.read",
    "skill.edit",
    "analytics.read"
  ]),
  viewer: new Set(["site.read", "form.read", "skill.read"]),
  analyst: new Set(["site.read", "form.read", "skill.read", "analytics.read"])
};

export const SITE_ROLE_LABEL: Record<SiteRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
  analyst: "Analyst"
};

export const SITE_ROLE_DETAIL: Record<SiteRole, string> = {
  owner: "Manages people, the domain, and go-live.",
  editor: "Makes changes in chat and can publish.",
  viewer: "Sees the site and its history.",
  analyst: "Sees the site, its history, and stats."
};

/**
 * An org admin can do every action, including promoting another admin.
 * An account admin can do every action inside the accounts they belong to,
 * including every site in those accounts.
 * A member can read that account.
 * A site role applies only to that site, and is combined with any account role.
 */
export function can(user: Principal, action: Action, resource: Resource = {}): boolean {
  if (user.disabled) return false;
  if (user.orgRole === "admin") return true;
  if (action === "org.manage") return false;
  if (resource.accountId) {
    const grant = user.memberships.find(
      (membership) => membership.accountId === resource.accountId
    );
    if (grant && (ROLE_ACTIONS[grant.role]?.has(action) ?? false)) return true;
  }
  if (!resource.siteId || !resource.accountId) return false;
  const siteGrant = (user.siteGrants ?? []).find(
    (grant) => grant.siteId === resource.siteId && grant.accountId === resource.accountId
  );
  if (!siteGrant) return false;
  return SITE_ROLE_ACTIONS[siteGrant.role]?.has(action) ?? false;
}

export function hasAnyAccess(user: Principal): boolean {
  if (user.disabled) return false;
  if (user.orgRole === "admin") return true;
  if (
    user.memberships.some((membership) =>
      (MEMBERSHIP_ROLES as readonly string[]).includes(membership.role)
    )
  ) {
    return true;
  }
  return (user.siteGrants ?? []).some((grant) =>
    (SITE_ROLES as readonly string[]).includes(grant.role)
  );
}

/**
 * A site may drop its last Owner only when an account admin already covers it.
 * A platform admin does not count as that cover.
 */
export function keepsAnOwner(input: {
  ownerIds: readonly string[];
  accountAdminCount: number;
  targetUserId: string;
  nextRole: SiteRole | null;
}): boolean {
  const isOwner = input.ownerIds.includes(input.targetUserId);
  if (!isOwner || input.nextRole === "owner") return true;
  const remaining = input.ownerIds.filter((id) => id !== input.targetUserId).length;
  if (remaining > 0) return true;
  return input.accountAdminCount > 0;
}

/**
 * The last account admin can be removed only when every site still has an Owner.
 */
export function keepsAccountCover(input: {
  accountAdminIds: readonly string[];
  targetUserId: string;
  sitesMissingOwner: number;
}): boolean {
  const isAdmin = input.accountAdminIds.includes(input.targetUserId);
  if (!isAdmin) return true;
  const remaining = input.accountAdminIds.filter((id) => id !== input.targetUserId).length;
  if (remaining > 0) return true;
  return input.sitesMissingOwner === 0;
}
