import { eq } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { siteDomain } from "@flagstage/db";

import { checkDnsRecords, type DnsLookup } from "./dns-check";
import { domainStatus, dueForRecheck, type DomainProvision } from "./drivers";
import type { DnsRecord } from "./records";

function asRecords(value: unknown): DnsRecord[] {
  return Array.isArray(value) ? (value as DnsRecord[]) : [];
}

export type DomainRefresh = (row: {
  hostname: string;
  cloudfrontTenantId: string | null;
}) => Promise<Pick<DomainProvision, "records" | "certificateStatus" | "distributionStatus"> | null>;

export async function recheckDueDomains(
  db: Database,
  lookup: DnsLookup,
  now = new Date(),
  refresh?: DomainRefresh
) {
  const rows = await db.select().from(siteDomain);
  let checked = 0;
  for (const row of rows) {
    if (
      !dueForRecheck(
        { status: row.status, createdAt: row.createdAt, lastCheckedAt: row.lastCheckedAt },
        now
      )
    ) {
      continue;
    }
    const refreshed = refresh ? await refresh(row) : null;
    const base = refreshed?.records ?? asRecords(row.records);
    const records = await checkDnsRecords(base, lookup);
    const status = domainStatus(
      records,
      refreshed?.certificateStatus ?? null,
      refreshed?.distributionStatus ?? null
    );
    await db
      .update(siteDomain)
      .set({ records, status, lastCheckedAt: now })
      .where(eq(siteDomain.id, row.id));
    checked += 1;
  }
  return checked;
}
