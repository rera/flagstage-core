"use server";

import { redirect } from "next/navigation";

import { account, site } from "@flagstage/db";
import { eq } from "drizzle-orm";

import { database, requirePrincipal } from "./guard";
import {
  addAccountAdmin,
  addSitePerson,
  changeSiteRole,
  removeAccountAdmin,
  removeSitePerson
} from "./roster";

async function accountSlug(accountId: string) {
  const rows = await database()
    .select({ slug: account.slug })
    .from(account)
    .where(eq(account.id, accountId))
    .limit(1);
  return rows[0]?.slug;
}

async function sitePath(siteId: string) {
  const rows = await database()
    .select({ accountId: site.accountId })
    .from(site)
    .where(eq(site.id, siteId))
    .limit(1);
  const slug = rows[0] ? await accountSlug(rows[0].accountId) : undefined;
  if (!slug) return "/";
  return `/a/${slug}/sites/${siteId}/settings/people`;
}

function withError(path: string, error?: string) {
  if (!error) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("error", error);
  return `${url.pathname}${url.search}`;
}

export async function addSitePersonAction(
  _previous: { secret?: string; error?: string } | null,
  formData: FormData
) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const result = await addSitePerson(database(), principal, {
    siteId,
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "editor")
  });
  if (result.secret || result.error) return result;
  redirect(await sitePath(siteId));
}

export async function changeSiteRoleAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const result = await changeSiteRole(database(), principal, {
    siteId,
    userId: String(formData.get("userId") ?? ""),
    role: String(formData.get("role") ?? "")
  });
  const path = await sitePath(siteId);
  redirect(result.error ? withError(path, "owner") : path);
}

export async function removeSitePersonAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const result = await removeSitePerson(database(), principal, {
    siteId,
    userId: String(formData.get("userId") ?? "")
  });
  const path = await sitePath(siteId);
  redirect(result.error ? withError(path, "owner") : path);
}

export async function addAccountPersonAction(
  _previous: { secret?: string; error?: string } | null,
  formData: FormData
) {
  const principal = await requirePrincipal();
  const accountId = String(formData.get("accountId") ?? "");
  const result = await addAccountAdmin(database(), principal, {
    accountId,
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? "")
  });
  if (result.secret || result.error) return result;
  const slug = await accountSlug(accountId);
  redirect(slug ? `/a/${slug}/people` : "/");
}

export async function removeAccountPersonAction(formData: FormData) {
  const principal = await requirePrincipal();
  const accountId = String(formData.get("accountId") ?? "");
  const result = await removeAccountAdmin(database(), principal, {
    accountId,
    userId: String(formData.get("userId") ?? "")
  });
  const slug = await accountSlug(accountId);
  const path = slug ? `/a/${slug}/people` : "/";
  redirect(result.error ? withError(path, "admin") : path);
}
