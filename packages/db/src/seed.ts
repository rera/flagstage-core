import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "./client";
import { account, authAccount, membership, orgSettings, site, snapshot, user } from "./schema";

export const DEMO_SITE = {
  siteId: "site-demo",
  snapshotId: "snap-demo",
  accountId: "acct-digital",
  slug: "demo",
  name: "Example site",
  prefix: "snapshots/site-demo/snap-demo/",
  html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Example site</title>
</head>
<body>
  <h1>Example site</h1>
  <p>This page is already published. Ask for a change in chat, preview it, then publish.</p>
</body>
</html>
`
};

export type DemoSite = {
  siteId: string;
  snapshotId: string;
  slug: string;
  prefix: string;
  html: string;
};

async function ensureDemoSite(db: Database): Promise<DemoSite> {
  const demo: DemoSite = {
    siteId: DEMO_SITE.siteId,
    snapshotId: DEMO_SITE.snapshotId,
    slug: DEMO_SITE.slug,
    prefix: DEMO_SITE.prefix,
    html: DEMO_SITE.html
  };
  const now = new Date();
  const sites = await db.select().from(site).where(eq(site.id, demo.siteId)).limit(1);
  if (!sites[0]) {
    await db.insert(site).values({
      id: demo.siteId,
      accountId: DEMO_SITE.accountId,
      name: DEMO_SITE.name,
      slug: demo.slug,
      sourceUrl: "https://example.com",
      status: "importing"
    });
  }
  const snaps = await db.select().from(snapshot).where(eq(snapshot.id, demo.snapshotId)).limit(1);
  if (!snaps[0]) {
    await db.insert(snapshot).values({
      id: demo.snapshotId,
      siteId: demo.siteId,
      kind: "import",
      storagePrefix: demo.prefix,
      fileCount: 1,
      bytes: new TextEncoder().encode(demo.html).byteLength,
      createdAt: now
    });
  }
  if (!sites[0]?.currentSnapshotId) {
    await db
      .update(site)
      .set({ currentSnapshotId: demo.snapshotId, status: "live" })
      .where(eq(site.id, demo.siteId));
  }
  return demo;
}

export async function seedDemo(
  db: Database,
  options?: { passwordHash?: string }
): Promise<DemoSite | null> {
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

  if (!options?.passwordHash) return null;
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "demo@example.com"))
    .limit(1);
  const userId = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
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
  }
  const accounts = [
    { id: "acct-membership", name: "Membership", slug: "membership" },
    { id: "acct-digital", name: "Digital", slug: "digital" }
  ];
  for (const row of accounts) {
    const found = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.id, row.id))
      .limit(1);
    if (found.length > 0) continue;
    await db.insert(account).values({ id: row.id, name: row.name, slug: row.slug });
    await db.insert(membership).values({
      id: randomUUID(),
      accountId: row.id,
      userId,
      role: "account_admin",
      source: "manual"
    });
  }
  return ensureDemoSite(db);
}
