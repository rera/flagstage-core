import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import { account, authAccount, createDb, membership, migrateWithLock, user } from "@flagstage/db";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const email = (process.env.E2E_EMAIL ?? "e2e@example.com").toLowerCase();
const password = process.env.E2E_PASSWORD ?? "e2e-password-e2e-password";

await migrateWithLock(url);
const { db, pool } = createDb(url);
const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
if (!existing[0]) {
  const id = randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id,
    name: "E2E Admin",
    email,
    emailVerified: true,
    org_role: "org_admin",
    org_role_source: "manual",
    createdAt: now,
    updatedAt: now
  });
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  });
  const accountId = randomUUID();
  await db.insert(account).values({ id: accountId, name: "Parks", slug: "parks" });
  await db.insert(membership).values({
    id: randomUUID(),
    accountId,
    userId: id,
    role: "account_admin",
    source: "manual"
  });
}
await pool.end();
console.log(`e2e admin ready ${email}`);
