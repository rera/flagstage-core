import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { can } from "@flagstage/core";
import { account, site } from "@flagstage/db";

import { database, requirePrincipal } from "../../../../../src/guard";

export default async function LegacySiteRedirect({
  params,
  searchParams
}: {
  params: Promise<{ siteId: string; path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId, path } = await params;
  const query = await searchParams;
  const principal = await requirePrincipal();
  const db = database();
  const rows = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found || !can(principal, "site.read", { accountId: found.accountId })) notFound();
  const accounts = await db.select().from(account).where(eq(account.id, found.accountId)).limit(1);
  const slug = accounts[0]?.slug;
  if (!slug) notFound();
  const rest = path?.length ? `/${path.join("/")}` : "";
  const url = new URL(`/a/${slug}/sites/${siteId}${rest}`, "http://local");
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }
  redirect(`${url.pathname}${url.search}`);
}
