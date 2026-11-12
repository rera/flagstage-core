import { eq } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { siteDomain } from "@flagstage/db";

import { checkDnsRecords, type DnsLookup } from "./dns-check";
import { dueForRecheck } from "./drivers";
import type { DnsRecord } from "./records";

function asRecords(value: unknown): DnsRecord[] {
  return Array.isArray(value) ? (value as DnsRecord[]) : [];
}

export async function recheckDueDomains(db: Database, lookup: DnsLookup, now = new Date()) {
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
    const records = await checkDnsRecords(asRecords(row.records), lookup);
    const ready = records.length > 0 && records.every((record) => record.found);
    await db
      .update(siteDomain)
      .set({ records, status: ready ? "active" : "verifying", lastCheckedAt: now })
      .where(eq(siteDomain.id, row.id));
    checked += 1;
  }
  return checked;
}
