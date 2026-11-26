import { requireSite } from "../../../../../../../src/guard";
import { redirectToSettingsTab } from "../../../../../../../src/site-settings-nav";

export default async function SitePeopleRedirect({
  params,
  searchParams
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { accountSlug, siteId } = await params;
  const { site: found } = await requireSite(accountSlug, siteId);
  redirectToSettingsTab(accountSlug, found.id, "people", await searchParams);
}
