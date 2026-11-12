// Ported from rera/flagstage packages/sites/src/domains/records.ts @ 27a19bd0c040d40ce2356d6758bb7127657ab782

import { isApexHostname } from "./hostname";

export const DNS_RECORD_PURPOSES = ["acm_validation", "cdn_alias"] as const;
export type DnsRecordPurpose = (typeof DNS_RECORD_PURPOSES)[number];

export type DnsRecord = {
  type: string;
  name: string;
  value: string;
  purpose: DnsRecordPurpose;
  found?: boolean;
  current?: string[];
};

export function stripDnsDot(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

export type GoLiveTarget = {
  cloudfrontDomain: string;
  apexAddresses: string[];
};

export function goLiveRecords(hostname: string, target: GoLiveTarget): DnsRecord[] {
  const cloudfront = stripDnsDot(target.cloudfrontDomain);
  if (!isApexHostname(hostname)) {
    return [{ type: "CNAME", name: hostname, value: cloudfront, purpose: "cdn_alias" }];
  }
  if (target.apexAddresses.length === 0) {
    return [{ type: "ALIAS", name: hostname, value: cloudfront, purpose: "cdn_alias" }];
  }
  return target.apexAddresses.map((address) => ({
    type: "A",
    name: hostname,
    value: address,
    purpose: "cdn_alias" as const
  }));
}

export function recordsForHostname(
  hostname: string,
  validationRecords: DnsRecord[],
  target: GoLiveTarget | null
): DnsRecord[] {
  const validation = validationRecords.filter((record) => {
    const name = stripDnsDot(record.name).toLowerCase();
    const labels = name.split(".").filter(Boolean);
    const validatedHost = labels.slice(1).join(".");
    return validatedHost === hostname || name === hostname;
  });
  const goLive = target ? goLiveRecords(hostname, target) : [];
  return dedupeDnsRecords([...validation, ...goLive]);
}

export function dedupeDnsRecords(records: DnsRecord[]): DnsRecord[] {
  const seen = new Set<string>();
  const out: DnsRecord[] = [];
  for (const record of records) {
    const key = `${record.type}\0${stripDnsDot(record.name).toLowerCase()}\0${stripDnsDot(record.value).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: record.type,
      name: stripDnsDot(record.name),
      value: stripDnsDot(record.value),
      purpose: record.purpose
    });
  }
  return out;
}
