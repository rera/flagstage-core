// Ported from rera/flagstage packages/sites/src/domains/dns-check.ts @ 27a19bd0c040d40ce2356d6758bb7127657ab782

import { Resolver } from "node:dns/promises";

import { stripDnsDot, type DnsRecord } from "./records";

export type DnsLookup = {
  cname(name: string): Promise<string[]>;
  ipv4(name: string): Promise<string[]>;
};

const MISSING = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

export function publicDnsLookup(): DnsLookup {
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  async function run(query: () => Promise<string[]>): Promise<string[]> {
    try {
      return await query();
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      if (MISSING.has(code)) return [];
      throw error;
    }
  }
  return {
    cname: (name) => run(() => resolver.resolveCname(name)),
    ipv4: (name) => run(() => resolver.resolve4(name))
  };
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => stripDnsDot(value).toLowerCase()))].sort();
}

async function checkRecord(lookup: DnsLookup, record: DnsRecord): Promise<DnsRecord> {
  const name = record.name.toLowerCase();
  const expected = stripDnsDot(record.value).toLowerCase();
  let current: string[];
  let found: boolean;
  if (record.type === "CNAME") {
    current = normalize(await lookup.cname(name));
    found = current.includes(expected);
  } else if (record.type === "A") {
    current = normalize(await lookup.ipv4(name));
    found = current.includes(expected);
  } else {
    const [actual, target] = await Promise.all([lookup.ipv4(name), lookup.ipv4(expected)]);
    current = normalize(actual);
    found = current.length > 0 && current.some((address) => target.includes(address));
  }
  return { ...record, found, ...(!found && current.length > 0 ? { current } : {}) };
}

export async function checkDnsRecords(
  records: DnsRecord[],
  lookup: DnsLookup
): Promise<DnsRecord[]> {
  return Promise.all(
    records.map(async (record) => {
      try {
        return await checkRecord(lookup, record);
      } catch {
        return record;
      }
    })
  );
}
