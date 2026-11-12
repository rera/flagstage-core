import { describe, expect, it } from "vitest";

import {
  projectGroups,
  reconcileGrants,
  type GroupMapping,
  type StoredMembership
} from "./reconcile";

const mappings: GroupMapping[] = [
  {
    providerId: "idp",
    groupExternalId: "grp-org",
    target: "org",
    role: "org_admin"
  },
  {
    providerId: "idp",
    groupExternalId: "grp-editors",
    target: "acct-1",
    role: "editor"
  },
  {
    providerId: "idp",
    groupExternalId: "grp-named-only",
    target: "acct-1",
    role: "editor"
  }
];

describe("projectGroups", () => {
  it("maps group ids and ignores display names", () => {
    const projected = projectGroups("idp", ["grp-editors"], mappings);
    expect(projected.orgRole).toBe("none");
    expect(projected.memberships).toEqual([{ accountId: "acct-1", role: "editor" }]);
  });

  it("does not treat a label as an id", () => {
    const projected = projectGroups("idp", ["Editors"], mappings);
    expect(projected.memberships).toEqual([]);
  });
});

describe("reconcileGrants", () => {
  const manual: StoredMembership = {
    accountId: "acct-manual",
    role: "account_admin",
    source: "manual"
  };
  const scim: StoredMembership = { accountId: "acct-1", role: "editor", source: "scim" };

  it("replaces only scim grants and keeps manual ones", () => {
    const result = reconcileGrants({
      source: "scim",
      active: true,
      currentOrgRole: "none",
      currentOrgRoleSource: "none",
      memberships: [manual, scim],
      projected: { orgRole: "none", memberships: [{ accountId: "acct-2", role: "reviewer" }] }
    });
    expect(result.memberships).toEqual([
      manual,
      { accountId: "acct-2", role: "reviewer", source: "scim" }
    ]);
  });

  it("replaces sso_claim grants without touching scim grants", () => {
    const result = reconcileGrants({
      source: "sso_claim",
      active: true,
      currentOrgRole: "none",
      currentOrgRoleSource: "none",
      memberships: [scim, { accountId: "acct-9", role: "editor", source: "sso_claim" }],
      projected: { orgRole: "org_admin", memberships: [] }
    });
    expect(result.memberships).toEqual([scim]);
    expect(result.orgRole).toBe("org_admin");
    expect(result.orgRoleSource).toBe("sso_claim");
  });

  it("does not downgrade a manual organization admin", () => {
    const result = reconcileGrants({
      source: "scim",
      active: true,
      currentOrgRole: "org_admin",
      currentOrgRoleSource: "manual",
      memberships: [manual],
      projected: { orgRole: "none", memberships: [] }
    });
    expect(result.orgRole).toBe("org_admin");
    expect(result.orgRoleSource).toBe("manual");
  });

  it("removes access when the user is deactivated", () => {
    const result = reconcileGrants({
      source: "scim",
      active: false,
      currentOrgRole: "org_admin",
      currentOrgRoleSource: "scim",
      memberships: [manual, scim],
      projected: { orgRole: "org_admin", memberships: [{ accountId: "acct-1", role: "editor" }] }
    });
    expect(result.memberships).toEqual([]);
    expect(result.orgRole).toBe("none");
    expect(result.clearSessions).toBe(true);
  });

  it("leaves an unmapped active user with no access", () => {
    const result = reconcileGrants({
      source: "scim",
      active: true,
      currentOrgRole: "none",
      currentOrgRoleSource: "none",
      memberships: [],
      projected: { orgRole: "none", memberships: [] }
    });
    expect(result.orgRole).toBe("none");
    expect(result.memberships).toEqual([]);
  });
});
