import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import {
  account,
  accountSkill,
  authAccount,
  changeRequest,
  createDb,
  membership,
  migrateWithLock,
  site,
  siteMembership,
  skillRevision,
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
const harborId = await ensureAccount("Harbor Labs", "harbor", 40);
const northId = await ensureAccount("North Studio", "north");

await ensureMembership(parksId, adminId, "account_admin");
await ensureMembership(harborId, adaId, "account_admin");
await ensureMembership(harborId, miaId, "member");
await ensureMembership(harborId, samId, "account_admin");
await ensureMembership(northId, samId, "account_admin");
await ensureMembership(northId, leeId, "account_admin");

const harborSites = await db.select().from(site).where(eq(site.slug, "waterfront"));
if (!harborSites[0]) {
  const siteId = randomUUID();
  const snapId = randomUUID();
  const earlierId = randomUUID();
  const oldestId = randomUUID();
  const threadId = randomUUID();
  const now = Date.now();
  await db.insert(site).values({
    id: siteId,
    accountId: harborId,
    name: "Waterfront",
    slug: "waterfront",
    sourceUrl: "https://harbor.example",
    status: "importing",
    timeZone: "America/Los_Angeles"
  });
  await db.insert(snapshot).values([
    {
      id: oldestId,
      siteId,
      kind: "import",
      storagePrefix: `sites/${siteId}/${oldestId}`,
      fileCount: 3,
      bytes: 9000,
      createdBy: samId,
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000)
    },
    {
      id: earlierId,
      siteId,
      kind: "edit",
      storagePrefix: `sites/${siteId}/${earlierId}`,
      fileCount: 4,
      bytes: 11000,
      createdBy: miaId,
      createdAt: new Date(now - 24 * 60 * 60 * 1000)
    },
    {
      id: snapId,
      siteId,
      kind: "publish",
      storagePrefix: `sites/${siteId}/${snapId}`,
      fileCount: 4,
      bytes: 12000,
      createdBy: adaId,
      createdAt: new Date(now)
    }
  ]);
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

const northSites = await db.select().from(site).where(eq(site.slug, "studio-hall"));
if (!northSites[0]) {
  await db.insert(site).values({
    id: randomUUID(),
    accountId: northId,
    name: "Studio hall",
    slug: "studio-hall",
    sourceUrl: "https://north.example",
    status: "preview",
    timeZone: "UTC"
  });
}

const jordanId = await ensureUser({
  email: "jordan.lee@example.com",
  name: "Jordan Lee",
  orgRole: "none"
});
const samPatelId = await ensureUser({
  email: "sam.patel@example.com",
  name: "Sam Patel",
  orgRole: "none"
});
const rileyId = await ensureUser({
  email: "riley.chen@example.com",
  name: "Riley Chen",
  orgRole: "none"
});
const morganId = await ensureUser({
  email: "morgan.blake@example.com",
  name: "Morgan Blake",
  orgRole: "none"
});
const alexId = await ensureUser({
  email: "alex.morgan@example.com",
  name: "Alex Morgan",
  orgRole: "none"
});
const averyId = await ensureUser({
  email: "avery.nguyen@example.com",
  name: "Avery Nguyen",
  orgRole: "none"
});
const taylorId = await ensureUser({
  email: "taylor.kim@example.com",
  name: "Taylor Kim",
  orgRole: "none"
});
await ensureUser({
  email: "casey.nguyen@example.com",
  name: "Casey Nguyen",
  orgRole: "none"
});

const championshipsId = await ensureAccount("Championships", "championships");
await ensureMembership(championshipsId, alexId, "account_admin");
await ensureMembership(championshipsId, averyId, "account_admin");
await ensureMembership(championshipsId, taylorId, "member");

const pgaRows = await db.select().from(site).where(eq(site.slug, "pga-championship"));
let pgaId = pgaRows[0]?.id;
if (!pgaId) {
  pgaId = randomUUID();
  const snapId = randomUUID();
  const storage = process.env.FS_STORAGE_DIR;
  const prefix = `snapshots/${pgaId}/${snapId}/`;
  await db.insert(site).values({
    id: pgaId,
    accountId: championshipsId,
    name: "PGA Championship",
    slug: "pga-championship",
    sourceUrl: "https://pgachampionship.com",
    status: "importing",
    timeZone: "America/New_York"
  });
  await db.insert(snapshot).values({
    id: snapId,
    siteId: pgaId,
    kind: "publish",
    storagePrefix: prefix,
    fileCount: 4,
    bytes: 2000,
    createdBy: jordanId,
    createdAt: new Date("2026-10-02T15:08:00.000Z")
  });
  await db
    .update(site)
    .set({ status: "live", currentSnapshotId: snapId })
    .where(eq(site.id, pgaId));
  if (storage) {
    const src = join(storage, prefix, "src");
    const skill = (slug: string, name: string, description: string, body: string) => {
      mkdirSync(join(src, ".flagstage", "skills", slug), { recursive: true });
      writeFileSync(
        join(src, ".flagstage", "skills", slug, "SKILL.md"),
        `---\nname: ${name}\ndescription: "${description}"\n---\n\n${body}\n`
      );
    };
    mkdirSync(src, { recursive: true });
    writeFileSync(
      join(src, "index.html"),
      "<!doctype html><html><body><h1>PGA Championship</h1></body></html>"
    );
    skill(
      "event-facts",
      "Event facts",
      "Dates, course, and other facts for this championship.",
      "Use these facts when a page mentions the event. Do not invent a date, a course, or a winner.\n\n## This championship\n\n- Event: PGA Championship\n- Site: pgachampionship.com\n- Dates: May 14–17, 2026\n- Course: Aronimink Golf Club\n\n## How to use them\n\n- Name the course the first time it appears on a page.\n- Keep the dates together on one line.\n- Do not add a winner, a purse, or a weather line.\n\n## Leave out\n\n- Do not guess a tee time.\n- Do not name a player unless the page is a player page."
    );
    skill(
      "page-structure",
      "Page structure",
      "Which pages exist, and which blocks are shared.",
      "Home, Schedule, Tickets, Course, and News are the main pages.\n\nThe header and the footer are shared. Change them once, not on each page.\n\nDo not add a page that is not listed here."
    );
    skill(
      "sponsor-lines",
      "Sponsor lines",
      "Sponsor names and the lines that must stay with them.",
      "Keep each sponsor name with its line. Do not move a line to another sponsor.\n\nDo not drop a sponsor from the footer."
    );
  }
}

async function ensureSiteRole(siteId: string, userId: string, role: string) {
  const existing = await db.select().from(siteMembership).where(eq(siteMembership.siteId, siteId));
  if (existing.some((row) => row.userId === userId)) return;
  await db.insert(siteMembership).values({ id: randomUUID(), siteId, userId, role });
}

await ensureSiteRole(pgaId, jordanId, "owner");
await ensureSiteRole(pgaId, samPatelId, "editor");
await ensureSiteRole(pgaId, rileyId, "viewer");
await ensureSiteRole(pgaId, morganId, "analyst");

async function ensureAccountSkill(input: {
  slug: string;
  name: string;
  description: string;
  body: string;
  history: Array<{ userId: string; action: string; at: string; note: string }>;
}) {
  const existing = await db
    .select()
    .from(accountSkill)
    .where(eq(accountSkill.accountId, championshipsId));
  if (existing.some((row) => row.slug === input.slug)) return;
  await db.insert(accountSkill).values({
    id: randomUUID(),
    accountId: championshipsId,
    slug: input.slug,
    name: input.name,
    description: input.description,
    body: input.body
  });
  for (const entry of input.history) {
    await db.insert(skillRevision).values({
      id: randomUUID(),
      accountId: championshipsId,
      slug: input.slug,
      actorUserId: entry.userId,
      action: entry.action,
      note: entry.note,
      createdAt: new Date(entry.at)
    });
  }
}

await ensureAccountSkill({
  slug: "brand-voice",
  name: "Brand voice",
  description: "How the account sounds in headlines and body text.",
  body: `Short sentences. The account sounds calm and specific.

## Headlines

- Headlines name the event.
- Say "championship" in a headline. Do not say "tournament" there.
- Do not use an exclamation mark.

## Names

- Use the official event names in Naming rules.
- Write the apostrophe in Women's. Do not write Womens.
- Do not shorten PGA Championship to PGA in a headline.
- Do not name a player unless the page is a player page.

## Body

- Lead with the fact, then the detail.
- Do not open a page with "Welcome" or "We're excited".
- Keep each sponsor line with the sponsor it belongs to.`,
  history: [
    {
      userId: averyId,
      action: "Saved",
      at: "2026-11-12T21:10:00.000Z",
      note: "Tightened the headline rule."
    },
    {
      userId: alexId,
      action: "Saved",
      at: "2026-09-03T17:26:00.000Z",
      note: "Added the player-name rule."
    },
    {
      userId: averyId,
      action: "Created",
      at: "2026-06-16T14:02:00.000Z",
      note: "Added the skill."
    }
  ]
});
await ensureAccountSkill({
  slug: "legal-lines",
  name: "Legal lines",
  description: "Required lines and claims the agent must keep.",
  body: "Keep the footer legal line on every page.\n\nDo not add a claim that is not in this skill.\n\nThe ticket line stays under the event dates. Do not shorten it.",
  history: [
    {
      userId: alexId,
      action: "Saved",
      at: "2026-10-08T15:40:00.000Z",
      note: "Added the ticket line."
    },
    {
      userId: averyId,
      action: "Created",
      at: "2026-06-16T14:18:00.000Z",
      note: "Added the skill."
    }
  ]
});
await ensureAccountSkill({
  slug: "naming-rules",
  name: "Naming rules",
  description: "Official names, and names to avoid.",
  body: "PGA Championship\nWomen's PGA Championship\n\nWrite the apostrophe in Women's. Do not write Womens.\n\nDo not shorten PGA Championship to PGA in a headline.",
  history: [
    {
      userId: averyId,
      action: "Saved",
      at: "2026-08-21T18:05:00.000Z",
      note: "Added Women's PGA Championship."
    },
    {
      userId: alexId,
      action: "Created",
      at: "2026-06-16T14:24:00.000Z",
      note: "Added the skill."
    }
  ]
});

const siteHistory = [
  {
    slug: "event-facts",
    entries: [
      {
        userId: jordanId,
        action: "Saved",
        at: "2026-11-24T20:42:00.000Z",
        note: "Updated the course name."
      },
      {
        userId: samPatelId,
        action: "Saved",
        at: "2026-11-18T14:15:00.000Z",
        note: "Added the event dates."
      },
      {
        userId: jordanId,
        action: "Created",
        at: "2026-10-02T15:08:00.000Z",
        note: "Added the skill."
      }
    ]
  },
  {
    slug: "page-structure",
    entries: [
      {
        userId: samPatelId,
        action: "Saved",
        at: "2026-11-04T13:55:00.000Z",
        note: "Listed the main pages."
      },
      {
        userId: jordanId,
        action: "Created",
        at: "2026-10-02T15:20:00.000Z",
        note: "Added the skill."
      }
    ]
  },
  {
    slug: "sponsor-lines",
    entries: [
      {
        userId: jordanId,
        action: "Created",
        at: "2026-10-09T20:36:00.000Z",
        note: "Added the skill."
      }
    ]
  }
];
const existingRevisions = await db
  .select()
  .from(skillRevision)
  .where(eq(skillRevision.siteId, pgaId));
if (existingRevisions.length === 0) {
  for (const skill of siteHistory) {
    for (const entry of skill.entries) {
      await db.insert(skillRevision).values({
        id: randomUUID(),
        siteId: pgaId,
        slug: skill.slug,
        actorUserId: entry.userId,
        action: entry.action,
        note: entry.note,
        createdAt: new Date(entry.at)
      });
    }
  }
}

await pool.end();
console.log("e2e users ready");
