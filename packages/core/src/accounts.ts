import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { account, invitation, membership, user, type Database } from "@flagstage/db";

import type { MembershipRole, OrgRole } from "./policy";

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
  input: { accountId: string; email: string; role: MembershipRole; ttlMs?: number }
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
    status: "pending"
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
}> {
  const rows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  const found = rows[0];
  if (!found) throw new Error("User not found.");
  const grants = await db.select().from(membership).where(eq(membership.userId, userId));
  return {
    orgRole: found.org_role === "admin" ? "admin" : "none",
    orgRoleSource: found.org_role_source,
    disabled: found.disabledAt != null,
    memberships: grants
      .filter((grant) => grant.role === "account_admin")
      .map((grant) => ({
        accountId: grant.accountId,
        role: "account_admin" as const,
        source: grant.source
      }))
  };
}
