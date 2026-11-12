import { describe, expect, it } from "vitest";

import { ACTIONS, can, hasAnyAccess, type Action, type Principal } from "./policy";

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
  it("lets an organization admin do every action", () => {
    const user = principal({ orgRole: "org_admin" });
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

  it("lets an editor publish and not manage members", () => {
    const user = principal({ memberships: [{ accountId: account, role: "editor" }] });
    expect(can(user, "site.edit", { accountId: account })).toBe(true);
    expect(can(user, "site.publish", { accountId: account })).toBe(true);
    expect(can(user, "member.manage", { accountId: account })).toBe(false);
    expect(can(user, "domain.manage", { accountId: account })).toBe(false);
    expect(can(user, "site.manage", { accountId: account })).toBe(false);
  });

  it("lets a reviewer read and comment, and blocks publish", () => {
    const user = principal({ memberships: [{ accountId: account, role: "reviewer" }] });
    const allowed = new Set<Action>(["account.read", "site.read", "site.comment", "form.read"]);
    for (const action of ACTIONS) {
      expect(can(user, action, { accountId: account }), action).toBe(allowed.has(action));
    }
  });

  it("denies a user with no mapped group", () => {
    const user = principal({});
    expect(hasAnyAccess(user)).toBe(false);
    expect(can(user, "site.read", { accountId: account })).toBe(false);
  });

  it("denies a disabled user even with grants", () => {
    const user = principal({
      disabled: true,
      orgRole: "org_admin",
      memberships: [{ accountId: account, role: "account_admin" }]
    });
    expect(hasAnyAccess(user)).toBe(false);
    expect(can(user, "org.manage")).toBe(false);
  });
});
