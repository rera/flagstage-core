import { describe, expect, it } from "vitest";

import { ACTIONS, can, hasAnyAccess, type Principal } from "./policy";

const account = "acct-digital";

function principal(partial: Partial<Principal>): Principal {
  return {
    id: "user-1",
    orgRole: "none",
    memberships: [],
    ...partial
  };
}

describe("can()", () => {
  it("lets an admin do every action", () => {
    const user = principal({ orgRole: "admin" });
    for (const action of ACTIONS) {
      expect(can(user, action, { accountId: account }), action).toBe(true);
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

  it("lets a member read one account and nothing else", () => {
    const user = principal({
      memberships: [{ accountId: account, role: "member" }]
    });
    expect(hasAnyAccess(user)).toBe(true);
    expect(can(user, "account.read", { accountId: account })).toBe(true);
    expect(can(user, "site.read", { accountId: account })).toBe(true);
    expect(can(user, "form.read", { accountId: account })).toBe(true);
    expect(can(user, "site.edit", { accountId: account })).toBe(false);
    expect(can(user, "site.manage", { accountId: account })).toBe(false);
    expect(can(user, "site.publish", { accountId: account })).toBe(false);
    expect(can(user, "member.manage", { accountId: account })).toBe(false);
    expect(can(user, "domain.manage", { accountId: account })).toBe(false);
    expect(can(user, "org.manage", { accountId: account })).toBe(false);
    expect(can(user, "site.read", { accountId: "other" })).toBe(false);
  });

  it("denies a user with no account", () => {
    const user = principal({});
    expect(hasAnyAccess(user)).toBe(false);
    expect(can(user, "site.read", { accountId: account })).toBe(false);
  });

  it("denies a disabled user even with grants", () => {
    const user = principal({
      disabled: true,
      orgRole: "admin",
      memberships: [{ accountId: account, role: "account_admin" }]
    });
    expect(hasAnyAccess(user)).toBe(false);
    expect(can(user, "org.manage")).toBe(false);
  });
});
