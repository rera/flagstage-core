import { Button, PageHeader, fieldClass } from "@flagstage/ui";
import { zoneTitle } from "@flagstage/publish/when";
import { can } from "@flagstage/core";

import { updateSiteTimeZoneAction } from "../../../../../../../src/actions";
import { requireSite } from "../../../../../../../src/guard";
import { Page } from "../../../../../../../src/page";
import { SiteIdentity } from "../../../../../../../src/site-nav";

const ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC"
];

export default async function SiteSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const query = await searchParams;
  const { principal, site: found } = await requireSite(accountSlug, siteId);
  const zones = ZONES.includes(found.timeZone) ? ZONES : [found.timeZone, ...ZONES];
  const canManage = can(principal, "site.manage", { accountId: found.accountId });
  return (
    <Page>
      <div className="space-y-4">
        <SiteIdentity name={found.name} status={found.status} host={`${found.slug}.localhost`} />
      </div>
      <PageHeader
        level={2}
        title="Site settings"
        description={`${found.name} uses ${zoneTitle(found.timeZone)} for scheduled publishes.`}
      />
      {query.error ? (
        <p className="text-sm text-destructive">That time zone was not recognized.</p>
      ) : null}
      {canManage ? (
        <form action={updateSiteTimeZoneAction} className="max-w-md space-y-4">
          <input type="hidden" name="siteId" value={found.id} />
          <input type="hidden" name="accountId" value={found.accountId} />
          <label className="block space-y-2 text-sm font-medium">
            Time zone
            <select name="timeZone" defaultValue={found.timeZone} className={fieldClass}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zoneTitle(zone)} ({zone})
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Save time zone</Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{zoneTitle(found.timeZone)}</p>
      )}
    </Page>
  );
}
