import { PageHeader } from "@flagstage/ui";

import { requireSite } from "../../../../../../../src/guard";
import { Page } from "../../../../../../../src/page";
import { SiteIdentity } from "../../../../../../../src/site-nav";

export default async function SitePluginsPage({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const { site: found } = await requireSite(accountSlug, siteId);
  const base = `/a/${accountSlug}/sites/${found.id}`;
  return (
    <Page>
      <SiteIdentity name={found.name} status={found.status} host={`${found.slug}.localhost`} />
      <PageHeader level={2} title="Plugins" description={`Installed plugins on ${found.name}.`} />
      <ul className="grid gap-3">
        <li>
          <a
            href={`${base}/plugins/forms`}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 hover:bg-[var(--wash)]"
          >
            <span className="min-w-0">
              <span className="block font-semibold">Forms</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                Submissions from forms on this site.
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-primary">Open</span>
          </a>
        </li>
      </ul>
    </Page>
  );
}
