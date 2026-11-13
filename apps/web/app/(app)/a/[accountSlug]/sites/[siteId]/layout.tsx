import type { ReactNode } from "react";

import { requireSite } from "../../../../../../src/guard";

export default async function SiteScopeLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ accountSlug: string; siteId: string }>;
}) {
  const { accountSlug, siteId } = await params;
  await requireSite(accountSlug, siteId);
  return children;
}
