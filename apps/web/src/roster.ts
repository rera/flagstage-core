import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { loadConfig } from "@flagstage/config";
import {
  can,
  createInvitation,
  keepsAccountCover,
  keepsAnOwner,
  SITE_ROLES,
  type Principal,
  type SiteRole
} from "@flagstage/core";
import { membership, site, siteMembership, user, type Database } from "@flagstage/db";
import { sendEmail } from "@flagstage/forms";

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  role: SiteRole;
};

export type AdminRow = {
  id: string;
  name: string;
  email: string;
};

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function ownerChoices(db: Database, accountId: string, principal: Principal) {
  const members = await db.select().from(membership).where(eq(membership.accountId, accountId));
  const sites = await db.select({ id: site.id }).from(site).where(eq(site.accountId, accountId));
  const roles =
    sites.length === 0
      ? []
      : await db
          .select()
          .from(siteMembership)
          .where(
            inArray(
              siteMembership.siteId,
              sites.map((row) => row.id)
            )
          );
  const ids = new Set<string>([
    ...members.map((row) => row.userId),
    ...roles.map((row) => row.userId)
  ]);
  if (principal.orgRole === "admin") ids.add(principal.id);
  if (ids.size === 0) return [];
  const people = await db
    .select()
    .from(user)
    .where(inArray(user.id, [...ids]));
  return people
    .filter((row) => row.disabledAt == null)
    .map((row) => ({ id: row.id, name: row.name, email: row.email }))
    .sort(
      (left, right) => left.name.localeCompare(right.name) || left.email.localeCompare(right.email)
    );
}

async function accountAdminIds(db: Database, accountId: string) {
  const rows = await db.select().from(membership).where(eq(membership.accountId, accountId));
  return rows.filter((row) => row.role === "account_admin").map((row) => row.userId);
}

async function ownerIds(db: Database, siteId: string) {
  const rows = await db.select().from(siteMembership).where(eq(siteMembership.siteId, siteId));
  return rows.filter((row) => row.role === "owner").map((row) => row.userId);
}

async function sitesMissingOwner(db: Database, accountId: string) {
  const sites = await db.select().from(site).where(eq(site.accountId, accountId));
  if (sites.length === 0) return 0;
  const roles = await db
    .select()
    .from(siteMembership)
    .where(
      inArray(
        siteMembership.siteId,
        sites.map((row) => row.id)
      )
    );
  return sites.filter(
    (row) => !roles.some((role) => role.siteId === row.id && role.role === "owner")
  ).length;
}

async function mail(to: string, link: string) {
  const config = loadConfig();
  const region = config.product?.region ?? config.S3_REGION;
  if (!config.MAIL_FROM || !region) return;
  await sendEmail({
    region,
    from: config.MAIL_FROM,
    to: [to],
    subject: "You are invited",
    text: `Open this link to join:\n${link}`
  }).catch(() => undefined);
}

export async function addSitePerson(
  db: Database,
  principal: Principal,
  input: { siteId: string; firstName: string; lastName: string; email: string; role: string }
): Promise<{ error?: string; secret?: string }> {
  const sites = await db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const found = sites[0];
  if (!found || !can(principal, "site.people", { accountId: found.accountId, siteId: found.id })) {
    return { error: "You cannot change people on this site." };
  }
  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  const email = input.email.trim().toLowerCase();
  if (!firstName || !lastName) return { error: "Enter a first and last name." };
  if (!email.includes("@")) return { error: "Enter an email address." };
  if (!(SITE_ROLES as readonly string[]).includes(input.role)) return { error: "Choose a role." };
  const name = `${firstName} ${lastName}`;
  const role = input.role as SiteRole;
  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const person = existing[0];
  if (!person) {
    const invite = await createInvitation(db, {
      accountId: found.accountId,
      email,
      role,
      siteId: found.id,
      personName: name
    });
    const link = `${loadConfig().APP_URL}/invitations/${invite.token}`;
    await mail(email, link);
    return { secret: link };
  }
  const current = await db
    .select()
    .from(siteMembership)
    .where(and(eq(siteMembership.siteId, found.id), eq(siteMembership.userId, person.id)))
    .limit(1);
  const admins = await accountAdminIds(db, found.accountId);
  if (
    !keepsAnOwner({
      ownerIds: await ownerIds(db, found.id),
      accountAdminCount: admins.length,
      targetUserId: person.id,
      nextRole: role
    })
  ) {
    return { error: "This site needs an owner." };
  }
  if (current[0]) {
    await db.update(siteMembership).set({ role }).where(eq(siteMembership.id, current[0].id));
  } else {
    await db.insert(siteMembership).values({
      id: randomUUID(),
      siteId: found.id,
      userId: person.id,
      role
    });
  }
  return {};
}

export async function changeSiteRole(
  db: Database,
  principal: Principal,
  input: { siteId: string; userId: string; role: string }
): Promise<{ error?: string }> {
  const sites = await db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const found = sites[0];
  if (!found || !can(principal, "site.people", { accountId: found.accountId, siteId: found.id })) {
    return { error: "You cannot change people on this site." };
  }
  if (!(SITE_ROLES as readonly string[]).includes(input.role)) return { error: "Choose a role." };
  const role = input.role as SiteRole;
  const current = await db
    .select()
    .from(siteMembership)
    .where(and(eq(siteMembership.siteId, found.id), eq(siteMembership.userId, input.userId)))
    .limit(1);
  if (!current[0]) return { error: "You cannot change people on this site." };
  const admins = await accountAdminIds(db, found.accountId);
  if (
    !keepsAnOwner({
      ownerIds: await ownerIds(db, found.id),
      accountAdminCount: admins.length,
      targetUserId: input.userId,
      nextRole: role
    })
  ) {
    return { error: "This site needs an owner." };
  }
  await db.update(siteMembership).set({ role }).where(eq(siteMembership.id, current[0].id));
  return {};
}

export async function removeSitePerson(
  db: Database,
  principal: Principal,
  input: { siteId: string; userId: string }
): Promise<{ error?: string }> {
  const sites = await db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const found = sites[0];
  if (!found || !can(principal, "site.people", { accountId: found.accountId, siteId: found.id })) {
    return { error: "You cannot change people on this site." };
  }
  const current = await db
    .select()
    .from(siteMembership)
    .where(and(eq(siteMembership.siteId, found.id), eq(siteMembership.userId, input.userId)))
    .limit(1);
  if (!current[0]) return {};
  const admins = await accountAdminIds(db, found.accountId);
  if (
    !keepsAnOwner({
      ownerIds: await ownerIds(db, found.id),
      accountAdminCount: admins.length,
      targetUserId: input.userId,
      nextRole: null
    })
  ) {
    return { error: "This site needs an owner." };
  }
  await db.delete(siteMembership).where(eq(siteMembership.id, current[0].id));
  return {};
}

export async function addAccountAdmin(
  db: Database,
  principal: Principal,
  input: { accountId: string; firstName: string; lastName: string; email: string }
): Promise<{ error?: string; secret?: string }> {
  if (!can(principal, "member.manage", { accountId: input.accountId })) {
    return { error: "You cannot invite members of this account." };
  }
  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  const email = input.email.trim().toLowerCase();
  if (!firstName || !lastName) return { error: "Enter a first and last name." };
  if (!email.includes("@")) return { error: "Enter an email address." };
  const name = `${firstName} ${lastName}`;
  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const person = existing[0];
  if (!person) {
    const invite = await createInvitation(db, {
      accountId: input.accountId,
      email,
      role: "account_admin",
      personName: name
    });
    const link = `${loadConfig().APP_URL}/invitations/${invite.token}`;
    await mail(email, link);
    return { secret: link };
  }
  const current = await db
    .select()
    .from(membership)
    .where(and(eq(membership.accountId, input.accountId), eq(membership.userId, person.id)))
    .limit(1);
  if (current[0]) {
    await db
      .update(membership)
      .set({ role: "account_admin", source: "manual" })
      .where(eq(membership.id, current[0].id));
  } else {
    await db.insert(membership).values({
      id: randomUUID(),
      accountId: input.accountId,
      userId: person.id,
      role: "account_admin",
      source: "manual"
    });
  }
  return {};
}

export async function removeAccountAdmin(
  db: Database,
  principal: Principal,
  input: { accountId: string; userId: string }
): Promise<{ error?: string }> {
  if (!can(principal, "member.manage", { accountId: input.accountId })) {
    return { error: "You cannot invite members of this account." };
  }
  if (
    !keepsAccountCover({
      accountAdminIds: await accountAdminIds(db, input.accountId),
      targetUserId: input.userId,
      sitesMissingOwner: await sitesMissingOwner(db, input.accountId)
    })
  ) {
    return { error: "This account needs an admin." };
  }
  await db
    .delete(membership)
    .where(and(eq(membership.accountId, input.accountId), eq(membership.userId, input.userId)));
  return {};
}
