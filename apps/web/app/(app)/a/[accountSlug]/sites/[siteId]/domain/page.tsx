import { eq } from "drizzle-orm";

import { can } from "@flagstage/core";
import { siteDomain } from "@flagstage/db";
import type { DnsRecord } from "@flagstage/domains";
import { Badge, Button, Field, PageHeader, t } from "@flagstage/ui";

import { addDomainAction, recheckDomainAction } from "../../../../../../../src/actions";
import { database, requireSite } from "../../../../../../../src/guard";
import { Page } from "../../../../../../../src/page";
import { SiteIdentity } from "../../../../../../../src/site-nav";

export default async function DomainPage({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const { principal, site: found } = await requireSite(accountSlug, siteId);
  const db = database();
  const domains = await db.select().from(siteDomain).where(eq(siteDomain.siteId, siteId));
  const canManage = can(principal, "domain.manage", { accountId: found.accountId });
  return (
    <Page>
      <div className="space-y-4">
        <SiteIdentity name={found.name} status={found.status} host={`${found.slug}.localhost`} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(16rem,22rem)]">
        <div className="space-y-6">
          <PageHeader level={2} title={t("domains.title")} description={t("domains.lead")} />
          {canManage ? (
            <form action={addDomainAction} className="space-y-4">
              <input type="hidden" name="siteId" value={found.id} />
              <input type="hidden" name="accountId" value={found.accountId} />
              <Field
                id="hostname"
                label={t("domains.hostname")}
                name="hostname"
                required
                placeholder="www.example.com"
              />
              <Button type="submit">{t("domains.add")}</Button>
            </form>
          ) : null}
          {domains.map((domain) => {
            const records = (domain.records ?? []) as DnsRecord[];
            return (
              <section key={domain.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{domain.hostname}</h2>
                  <Badge variant={domain.status === "active" ? "success" : "warning"}>
                    {domain.status}
                  </Badge>
                </div>
                <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                  {records.map((record) => (
                    <div
                      key={`${record.type}${record.name}${record.value}`}
                      className="grid gap-2 border-b border-[var(--line)] px-4 py-3 text-sm last:border-b-0 md:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1.4fr)_9rem]"
                    >
                      <span className="font-medium">{record.type}</span>
                      <span className="font-mono text-[13px] break-all">{record.name}</span>
                      <span className="font-mono text-[13px] break-all">{record.value}</span>
                      <span>
                        {record.found ? t("domains.found") : t("domains.missing")}
                        {record.current?.length
                          ? ` ${t("domains.current")} ${record.current.join(", ")}`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
                {canManage ? (
                  <form action={recheckDomainAction}>
                    <input type="hidden" name="siteId" value={found.id} />
                    <input type="hidden" name="accountId" value={found.accountId} />
                    <input type="hidden" name="domainId" value={domain.id} />
                    <Button type="submit" variant="outline">
                      {t("domains.check")}
                    </Button>
                  </form>
                ) : null}
              </section>
            );
          })}
        </div>
        <aside className="rounded-xl border border-border bg-card px-4 py-4 text-sm">
          <h2 className="font-semibold">Before it is connected</h2>
          <p className="mt-2 text-muted-foreground">The site answers on {found.slug}.localhost.</p>
          <p className="mt-2 text-muted-foreground">
            Add the hostname, then create the records at your DNS host. Core checks them. It does
            not change DNS for you.
          </p>
        </aside>
      </div>
    </Page>
  );
}
