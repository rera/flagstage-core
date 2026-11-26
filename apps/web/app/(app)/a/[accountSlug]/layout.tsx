import type { ReactNode } from "react";

import { requireAccountScope } from "../../../../src/guard";

export default async function AccountLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ accountSlug: string }>;
}) {
  const { accountSlug } = await params;
  await requireAccountScope(accountSlug);
  return children;
}
