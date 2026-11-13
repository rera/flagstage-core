import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import {
  account,
  authAccount,
  changeRequest,
  createDb,
  membership,
  migrateWithLock,
  site,
  snapshot,
  thread,
  user
} from "@flagstage/db";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const password = process.env.E2E_PASSWORD ?? "e2e-password-e2e-password";

await migrateWithLock(url);
const { db, pool } = createDb(url);
const hashed = await hashPassword(password);

async function ensureUser(input: { email: string; name: string; orgRole: "admin" | "none" }) {
  const email = input.email.toLowerCase();
  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id,
    name: input.name,
    email,
    emailVerified: true,
    org_role: input.orgRole,
    org_role_source: "manual",
    createdAt: now,
    updatedAt: now
  });
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: hashed,
    createdAt: now,
    updatedAt: now
  });
  return id;
}

async function ensureAccount(name: string, slug: string, monthlyBudgetUsd: number | null = null) {
  const existing = await db.select().from(account).where(eq(account.slug, slug)).limit(1);
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await db.insert(account).values({ id, name, slug, monthlyBudgetUsd });
  return id;
}

async function ensureMembership(accountId: string, userId: string, role: string) {
  const existing = await db.select().from(membership).where(eq(membership.userId, userId));
  if (existing.some((row) => row.accountId === accountId)) return;
  await db.insert(membership).values({
    id: randomUUID(),
    accountId,
    userId,
    role,
    source: "manual"
  });
}

const adminId = await ensureUser({
  email: process.env.E2E_EMAIL ?? "e2e@example.com",
  name: "E2E Admin",
  orgRole: "admin"
});
const adaId = await ensureUser({
  email: "ada@example.com",
  name: "Ada Chen",
  orgRole: "none"
});
const miaId = await ensureUser({
  email: "mia@example.com",
  name: "Mia Alvarez",
  orgRole: "none"
});
const samId = await ensureUser({
  email: "sam@example.com",
  name: "Sam Okonkwo",
  orgRole: "none"
});
const leeId = await ensureUser({
  email: "lee@example.com",
  name: "Lee Park",
  orgRole: "none"
});

const parksId = await ensureAccount("Parks", "parks");
const harborId = await ensureAccount("Harbor", "harbor", 40);
const northId = await ensureAccount("North", "north");

await ensureMembership(parksId, adminId, "account_admin");
await ensureMembership(harborId, adaId, "account_admin");
await ensureMembership(harborId, miaId, "member");
await ensureMembership(harborId, samId, "account_admin");
await ensureMembership(northId, samId, "account_admin");
await ensureMembership(northId, leeId, "account_admin");

const harborSites = await db.select().from(site).where(eq(site.slug, "harbor"));
if (!harborSites[0]) {
  const siteId = randomUUID();
  const snapId = randomUUID();
  const threadId = randomUUID();
  await db.insert(site).values({
    id: siteId,
    accountId: harborId,
    name: "Harbor",
    slug: "harbor",
    sourceUrl: "https://harbor.example",
    status: "importing",
    timeZone: "America/Los_Angeles"
  });
  await db.insert(snapshot).values({
    id: snapId,
    siteId,
    kind: "publish",
    storagePrefix: `sites/${siteId}/${snapId}`,
    fileCount: 4,
    bytes: 12000,
    createdBy: adaId
  });
  await db
    .update(site)
    .set({ status: "live", currentSnapshotId: snapId })
    .where(eq(site.id, siteId));
  await db.insert(thread).values({
    id: threadId,
    siteId,
    title: "Changes",
    status: "open",
    createdBy: adaId
  });
  await db.insert(changeRequest).values({
    id: randomUUID(),
    threadId,
    siteId,
    status: "published",
    summary: "Updated the hours",
    usage: { inputTokens: 800, outputTokens: 200, estimatedUsd: 0.42 }
  });
}

const pierSites = await db.select().from(site).where(eq(site.slug, "pier"));
if (!pierSites[0]) {
  await db.insert(site).values({
    id: randomUUID(),
    accountId: harborId,
    name: "Pier",
    slug: "pier",
    sourceUrl: "https://pier.example",
    status: "preview",
    timeZone: "America/Los_Angeles"
  });
}

const northSites = await db.select().from(site).where(eq(site.slug, "north-hall"));
if (!northSites[0]) {
  await db.insert(site).values({
    id: randomUUID(),
    accountId: northId,
    name: "North hall",
    slug: "north-hall",
    sourceUrl: "https://north.example",
    status: "preview",
    timeZone: "UTC"
  });
}

await pool.end();
console.log("e2e users ready");
