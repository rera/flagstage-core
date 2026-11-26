import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  can,
  hasAnyAccess,
  keepsAccountCover,
  keepsAnOwner,
  type Action,
  type Principal,
  type SiteRole
} from "./policy";

const account = "acct-digital";
const site = "site-pga";

function principal(partial: Partial<Principal>): Principal {
  return {
    id: "user-1",
    orgRole: "none",
    memberships: [],
    siteGrants: [],
    ...partial
  };
}

const protectedActions = [
  "site.edit",
  "site.publish",
  "domain.manage",
  "site.people",
  "skill.edit",
  "skill.read",
  "analytics.read"
] as const satisfies readonly Action[];

/**
 * Chat edits, publish, domain, people, and skill edits follow the role text.
 * Reading a skill is open to every role that can open the site.
 * Stats are for the analyst, and for owner and editor, who already run the site.
 * An account member keeps the read access they had, including stats.
 */
const matrix: Record<string, Record<(typeof protectedActions)[number], boolean>> = {
  owner: {
    "site.edit": true,
    "site.publish": true,
    "domain.manage": true,
    "site.people": true,
    "skill.edit": true,
    "skill.read": true,
    "analytics.read": true
  },
  editor: {
    "site.edit": true,
    "site.publish": true,
    "domain.manage": false,
    "site.people": false,
    "skill.edit": true,
    "skill.read": true,
    "analytics.read": true
  },
  viewer: {
    "site.edit": false,
    "site.publish": false,
    "domain.manage": false,
    "site.people": false,
    "skill.edit": false,
    "skill.read": true,
    "analytics.read": false
  },
  analyst: {
    "site.edit": false,
    "site.publish": false,
    "domain.manage": false,
    "site.people": false,
    "skill.edit": false,
    "skill.read": true,
    "analytics.read": true
  }
};

describe("can()", () => {
  it("lets an admin do every action", () => {
    const user = principal({ orgRole: "admin" });
    for (const action of ACTIONS) {
      expect(can(user, action, { accountId: account, siteId: site }), action).toBe(true);
    }
  });

  it("limits an account admin to their account", () => {
    const user = principal({
      memberships: [{ accountId: account, role: "account_admin" }]
    });
    expect(can(user, "member.manage", { accountId: account })).toBe(true);
    expect(can(user, "domain.manage", { accountId: account })).toBe(true);
    expect(can(user, "site.publish", { accountId: account })).toBe(true);
    expect(can(user, "org.manage", { accountId: account })).toBe(false);
    expect(can(user, "member.manage", { accountId: "other" })).toBe(false);
  });

  it("lets an account admin inherit every protected action on every site", () => {
    const user = principal({
      memberships: [{ accountId: account, role: "account_admin" }]
    });
    for (const action of protectedActions) {
      expect(can(user, action, { accountId: account, siteId: site }), action).toBe(true);
      expect(can(user, action, { accountId: "other", siteId: site }), action).toBe(false);
    }
    expect(can(user, "skill.edit", { accountId: account })).toBe(true);
  });

  it("lets a member read one account and nothing else", () => {
    const user = principal({
      memberships: [{ accountId: account, role: "member" }]
    });
    expect(hasAnyAccess(user)).toBe(true);
    expect(can(user, "account.read", { accountId: account })).toBe(true);
    expect(can(user, "site.read", { accountId: account })).toBe(true);
    expect(can(user, "form.read", { accountId: account })).toBe(true);
    expect(can(user, "skill.read", { accountId: account, siteId: site })).toBe(true);
    expect(can(user, "analytics.read", { accountId: account, siteId: site })).toBe(true);
    expect(can(user, "site.edit", { accountId: account })).toBe(false);
    expect(can(user, "site.manage", { accountId: account })).toBe(false);
    expect(can(user, "site.publish", { accountId: account })).toBe(false);
    expect(can(user, "member.manage", { accountId: account })).toBe(false);
    expect(can(user, "domain.manage", { accountId: account })).toBe(false);
    expect(can(user, "skill.edit", { accountId: account, siteId: site })).toBe(false);
    expect(can(user, "site.people", { accountId: account, siteId: site })).toBe(false);
    expect(can(user, "org.manage", { accountId: account })).toBe(false);
    expect(can(user, "site.read", { accountId: "other" })).toBe(false);
  });

  it("checks every site role against every protected action", () => {
    for (const role of Object.keys(matrix) as SiteRole[]) {
      const user = principal({
        siteGrants: [{ siteId: site, accountId: account, role }]
      });
      for (const action of protectedActions) {
        expect(can(user, action, { accountId: account, siteId: site }), `${role} ${action}`).toBe(
          matrix[role]?.[action]
        );
      }
      expect(can(user, "site.edit", { accountId: account, siteId: "other" }), role).toBe(false);
      expect(can(user, "site.manage", { accountId: account, siteId: site }), role).toBe(false);
      expect(can(user, "member.manage", { accountId: account }), role).toBe(false);
      expect(can(user, "skill.edit", { accountId: account }), role).toBe(false);
    }
  });

  it("unions an account member with a site editor role", () => {
    const user = principal({
      memberships: [{ accountId: account, role: "member" }],
      siteGrants: [{ siteId: site, accountId: account, role: "editor" }]
    });
    expect(can(user, "site.edit", { accountId: account, siteId: site })).toBe(true);
    expect(can(user, "site.edit", { accountId: account, siteId: "other" })).toBe(false);
    expect(can(user, "domain.manage", { accountId: account, siteId: site })).toBe(false);
  });

  it("denies a user with no account", () => {
    const user = principal({});
    expect(hasAnyAccess(user)).toBe(false);
    expect(can(user, "site.read", { accountId: account })).toBe(false);
  });

  it("lets a site role open that site without an account membership", () => {
    const user = principal({
      siteGrants: [{ siteId: site, accountId: account, role: "viewer" }]
    });
    expect(hasAnyAccess(user)).toBe(true);
    expect(can(user, "site.read", { accountId: account, siteId: site })).toBe(true);
    expect(can(user, "account.read", { accountId: account })).toBe(false);
  });

  it("denies a disabled user even with grants", () => {
    const user = principal({
      disabled: true,
      orgRole: "admin",
      memberships: [{ accountId: account, role: "account_admin" }],
      siteGrants: [{ siteId: site, accountId: account, role: "owner" }]
    });
    expect(hasAnyAccess(user)).toBe(false);
    expect(can(user, "org.manage")).toBe(false);
    expect(can(user, "site.publish", { accountId: account, siteId: site })).toBe(false);
  });
});

describe("last owner", () => {
  it("keeps the last owner when no account admin covers the site", () => {
    expect(
      keepsAnOwner({
        ownerIds: ["jordan"],
        accountAdminCount: 0,
        targetUserId: "jordan",
        nextRole: "editor"
      })
    ).toBe(false);
    expect(
      keepsAnOwner({
        ownerIds: ["jordan"],
        accountAdminCount: 0,
        targetUserId: "jordan",
        nextRole: null
      })
    ).toBe(false);
  });

  it("lets the last owner change when an account admin covers the site", () => {
    expect(
      keepsAnOwner({
        ownerIds: ["jordan"],
        accountAdminCount: 1,
        targetUserId: "jordan",
        nextRole: "viewer"
      })
    ).toBe(true);
    expect(
      keepsAnOwner({
        ownerIds: ["jordan"],
        accountAdminCount: 1,
        targetUserId: "jordan",
        nextRole: null
      })
    ).toBe(true);
  });

  it("lets an owner change when another owner remains", () => {
    expect(
      keepsAnOwner({
        ownerIds: ["jordan", "taylor"],
        accountAdminCount: 0,
        targetUserId: "jordan",
        nextRole: "editor"
      })
    ).toBe(true);
    expect(
      keepsAnOwner({
        ownerIds: ["jordan"],
        accountAdminCount: 0,
        targetUserId: "sam",
        nextRole: null
      })
    ).toBe(true);
    expect(
      keepsAnOwner({
        ownerIds: ["jordan"],
        accountAdminCount: 0,
        targetUserId: "jordan",
        nextRole: "owner"
      })
    ).toBe(true);
  });

  it("refuses to remove the last account admin while a site has no owner", () => {
    expect(
      keepsAccountCover({
        accountAdminIds: ["alex"],
        targetUserId: "alex",
        sitesMissingOwner: 1
      })
    ).toBe(false);
    expect(
      keepsAccountCover({
        accountAdminIds: ["alex"],
        targetUserId: "alex",
        sitesMissingOwner: 0
      })
    ).toBe(true);
    expect(
      keepsAccountCover({
        accountAdminIds: ["alex", "avery"],
        targetUserId: "alex",
        sitesMissingOwner: 2
      })
    ).toBe(true);
  });
});
