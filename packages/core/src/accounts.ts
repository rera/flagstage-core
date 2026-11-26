import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import {
  account,
  invitation,
  membership,
  orgSettings,
  site,
  siteMembership,
  user,
  type Database
} from "@flagstage/db";

import {
  MEMBERSHIP_ROLES,
  SITE_ROLES,
  type MembershipRole,
  type OrgRole,
  type SiteRole
} from "./policy";

export type StoredMembership = {
  accountId: string;
  role: MembershipRole;
  source: string;
};

export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "account";
}

export async function createAccount(db: Database, name: string, slug = slugify(name)) {
  const id = randomUUID();
  await db.insert(account).values({ id, name: name.trim(), slug });
  return { id, name: name.trim(), slug };
}

export async function listAccounts(db: Database) {
  return db.select().from(account);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation(
  db: Database,
  input: {
    accountId: string;
    email: string;
    role: MembershipRole | SiteRole;
    ttlMs?: number;
    siteId?: string;
    personName?: string;
  }
) {
  const token = randomBytes(24).toString("base64url");
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 7 * 24 * 60 * 60 * 1000));
  await db.insert(invitation).values({
    id,
    accountId: input.accountId,
    email: input.email.toLowerCase(),
    role: input.role,
    tokenHash: hashToken(token),
    expiresAt,
    status: "pending",
    siteId: input.siteId,
    personName: input.personName?.trim() || null
  });
  return { id, token, expiresAt };
}

export async function acceptInvitation(db: Database, token: string, userId: string, email: string) {
  const row = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.tokenHash, hashToken(token)), eq(invitation.status, "pending")))
    .limit(1);
  const invite = row[0];
  if (!invite || invite.expiresAt.getTime() < Date.now()) {
    throw new Error("Invitation is expired or unknown.");
  }
  if (invite.email !== email.toLowerCase()) {
    throw new Error("This invitation is for a different email address.");
  }
  if (invite.siteId && (SITE_ROLES as readonly string[]).includes(invite.role)) {
    await db
      .insert(siteMembership)
      .values({
        id: randomUUID(),
        siteId: invite.siteId,
        userId,
        role: invite.role
      })
      .onConflictDoNothing();
  } else if ((MEMBERSHIP_ROLES as readonly string[]).includes(invite.role)) {
    await db
      .insert(membership)
      .values({
        id: randomUUID(),
        accountId: invite.accountId,
        userId,
        role: invite.role,
        source: "manual"
      })
      .onConflictDoNothing();
  }
  if (invite.personName) {
    const people = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    const current = people[0];
    if (current && (current.name === current.email || current.name.trim() === "")) {
      await db
        .update(user)
        .set({ name: invite.personName, updatedAt: new Date() })
        .where(eq(user.id, userId));
    }
  }
  await db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, invite.id));
  return invite;
}

export async function loadGrants(
  db: Database,
  userId: string
): Promise<{
  orgRole: OrgRole;
  orgRoleSource: string;
  disabled: boolean;
  memberships: StoredMembership[];
  siteGrants: Array<{ siteId: string; accountId: string; role: SiteRole }>;
}> {
  const rows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  const found = rows[0];
  if (!found) throw new Error("User not found.");
  const grants = await db.select().from(membership).where(eq(membership.userId, userId));
  const sites = await db.select().from(siteMembership).where(eq(siteMembership.userId, userId));
  const siteIds = sites.map((row) => row.siteId);
  const siteRows =
    siteIds.length === 0 ? [] : await db.select().from(site).where(inArray(site.id, siteIds));
  const accountBySite = new Map(siteRows.map((row) => [row.id, row.accountId]));
  return {
    orgRole: found.org_role === "admin" ? "admin" : "none",
    orgRoleSource: found.org_role_source,
    disabled: found.disabledAt != null,
    memberships: grants
      .filter((grant): grant is typeof grant & { role: MembershipRole } =>
        (MEMBERSHIP_ROLES as readonly string[]).includes(grant.role)
      )
      .map((grant) => ({
        accountId: grant.accountId,
        role: grant.role,
        source: grant.source
      })),
    siteGrants: sites.flatMap((row) => {
      const accountId = accountBySite.get(row.siteId);
      if (!accountId || !(SITE_ROLES as readonly string[]).includes(row.role)) return [];
      return [{ siteId: row.siteId, accountId, role: row.role as SiteRole }];
    })
  };
}

export async function syncOrganization(
  db: Database,
  input: { name: string; domain: string }
): Promise<void> {
  await db
    .update(orgSettings)
    .set({
      name: input.name,
      baseDomain: input.domain,
      previewDomain: "",
      updatedAt: new Date()
    })
    .where(eq(orgSettings.id, "org"));
}
