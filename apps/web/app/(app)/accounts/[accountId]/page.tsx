import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { can } from "@flagstage/core";
import { account } from "@flagstage/db";

import { database, requirePrincipal } from "../../../../src/guard";

export default async function LegacyAccountRedirect({
  params
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const principal = await requirePrincipal();
  if (!can(principal, "account.read", { accountId })) notFound();
  const rows = await database().select().from(account).where(eq(account.id, accountId)).limit(1);
  const found = rows[0];
  if (!found) notFound();
  redirect(`/a/${found.slug}/sites`);
}
