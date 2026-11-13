import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { can } from "@flagstage/core";
import { site, siteDomain } from "@flagstage/db";
import type { DnsRecord } from "@flagstage/domains";
import { Badge, Button, Field, PageHeader, t } from "@flagstage/ui";

import { addDomainAction, recheckDomainAction } from "../../../../../src/actions";
import { database, requirePrincipal } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { SiteIdentity, SiteNav } from "../../../../../src/site-nav";

export default async function DomainPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const principal = await requirePrincipal();
  const db = database();
  const rows = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found || !can(principal, "site.read", { accountId: found.accountId })) notFound();
  const domains = await db.select().from(siteDomain).where(eq(siteDomain.siteId, siteId));
  const canManage = can(principal, "domain.manage", { accountId: found.accountId });
  return (
    <Page>
      <div className="space-y-4">
        <SiteIdentity
          siteId={found.id}
          name={found.name}
          status={found.status}
          host={`${found.slug}.localhost`}
        />
        <SiteNav siteId={found.id} current="domain" />
      </div>
      <PageHeader level={2} title={t("domains.title")} description={t("domains.lead")} />
      {canManage ? (
        <form action={addDomainAction} className="max-w-md space-y-4">
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
    </Page>
  );
}
