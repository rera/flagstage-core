import type { ReactNode } from "react";

import { requireAccount } from "../../../../src/guard";

export default async function AccountLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ accountSlug: string }>;
}) {
  const { accountSlug } = await params;
  await requireAccount(accountSlug);
  return children;
}
