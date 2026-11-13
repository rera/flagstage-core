import { redirect } from "next/navigation";

import { accountHome, requireAccount } from "../../../../src/guard";

export default async function AccountHomePage({
  params
}: {
  params: Promise<{ accountSlug: string }>;
}) {
  const { accountSlug } = await params;
  const { account: found } = await requireAccount(accountSlug);
  redirect(await accountHome(found));
}
