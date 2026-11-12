import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { can } from "@flagstage/core";
import { site, siteDomain } from "@flagstage/db";
import type { DnsRecord } from "@flagstage/domains";
import { Badge, Button, PageHeader, t } from "@flagstage/ui";

import { addDomainAction, recheckDomainAction } from "../../../../src/actions";
import { database, requirePrincipal } from "../../../../src/guard";

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
    <>
      <PageHeader title={t("domains.title")} description={found.name} />
      <p>{t("domains.lead")}</p>
      {canManage ? (
        <form action={addDomainAction}>
          <input type="hidden" name="siteId" value={found.id} />
          <input type="hidden" name="accountId" value={found.accountId} />
          <label className="field" htmlFor="hostname">
            <span>{t("domains.hostname")}</span>
            <input id="hostname" name="hostname" required placeholder="www.example.com" />
          </label>
          <Button type="submit">{t("domains.add")}</Button>
        </form>
      ) : null}
      {domains.map((domain) => {
        const records = (domain.records ?? []) as DnsRecord[];
        return (
          <section key={domain.id}>
            <h2>
              {domain.hostname}{" "}
              <Badge tone={domain.status === "active" ? "ok" : "warn"}>{domain.status}</Badge>
            </h2>
            <table>
              <tbody>
                {records.map((record) => (
                  <tr key={`${record.type}${record.name}${record.value}`}>
                    <td>{record.type}</td>
                    <td>{record.name}</td>
                    <td>{record.value}</td>
                    <td>{record.found ? t("domains.found") : t("domains.missing")}</td>
                    <td>
                      {record.current?.length
                        ? `${t("domains.current")} ${record.current.join(", ")}`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canManage ? (
              <form action={recheckDomainAction}>
                <input type="hidden" name="siteId" value={found.id} />
                <input type="hidden" name="accountId" value={found.accountId} />
                <input type="hidden" name="domainId" value={domain.id} />
                <Button type="submit" variant="quiet">
                  {t("domains.check")}
                </Button>
              </form>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
