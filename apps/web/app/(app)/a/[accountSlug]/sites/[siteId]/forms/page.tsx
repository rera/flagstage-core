import { redirect } from "next/navigation";

import { requireSite } from "../../../../../../../src/guard";

export default async function FormsRedirect({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const { site: found } = await requireSite(accountSlug, siteId);
  redirect(`/a/${accountSlug}/sites/${found.id}/plugins/forms`);
}
