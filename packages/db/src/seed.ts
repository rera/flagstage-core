import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "./client";
import { account, authAccount, membership, orgSettings, user } from "./schema";

export async function seedDemo(db: Database, options?: { passwordHash?: string }): Promise<void> {
  const now = new Date();
  await db
    .update(orgSettings)
    .set({
      name: "Demo Organization",
      baseDomain: "localhost",
      previewDomain: "localhost",
      signupMode: "invite",
      configuredAt: now,
      updatedAt: now
    })
    .where(eq(orgSettings.id, "org"));

  if (!options?.passwordHash) return;
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "demo@example.com"))
    .limit(1);
  if (existing.length > 0) return;

  const userId = randomUUID();
  await db.insert(user).values({
    id: userId,
    name: "Demo Admin",
    email: "demo@example.com",
    emailVerified: true,
    org_role: "org_admin",
    org_role_source: "bootstrap",
    createdAt: now,
    updatedAt: now
  });
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: options.passwordHash,
    createdAt: now,
    updatedAt: now
  });
  const accounts = [
    { id: "acct-membership", name: "Membership", slug: "membership" },
    { id: "acct-digital", name: "Digital", slug: "digital" }
  ];
  for (const row of accounts) {
    await db.insert(account).values({ id: row.id, name: row.name, slug: row.slug });
    await db.insert(membership).values({
      id: randomUUID(),
      accountId: row.id,
      userId,
      role: "account_admin",
      source: "manual"
    });
  }
}
