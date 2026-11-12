import type { DnsRecord } from "./records";
import { goLiveRecords, recordsForHostname } from "./records";

export type TenantCreateResult = {
  tenantId: string;
  validationRecords: DnsRecord[];
};

/** The subset of the CloudFront client the adapter needs. Tests pass a fake. */
export type TenantClient = {
  createTenant(input: {
    distributionId: string;
    connectionGroupId: string;
    hostname: string;
  }): Promise<TenantCreateResult>;
};

export type DomainProvision = {
  tenantId: string | null;
  records: DnsRecord[];
};

export type DomainsDriver = {
  provision(hostname: string): Promise<DomainProvision>;
};

export function noneDriver(endpoint: string): DomainsDriver {
  return {
    async provision(hostname) {
      return {
        tenantId: null,
        records: goLiveRecords(hostname, { cloudfrontDomain: endpoint, apexAddresses: [] })
      };
    }
  };
}

export function cloudfrontDriver(input: {
  client: TenantClient;
  distributionId: string;
  connectionGroupId: string;
  endpoint: string;
}): DomainsDriver {
  return {
    async provision(hostname) {
      const created = await input.client.createTenant({
        distributionId: input.distributionId,
        connectionGroupId: input.connectionGroupId,
        hostname
      });
      return {
        tenantId: created.tenantId,
        records: recordsForHostname(hostname, created.validationRecords, {
          cloudfrontDomain: input.endpoint,
          apexAddresses: []
        })
      };
    }
  };
}

export type KeyValueWriter = {
  put(key: string, value: string): Promise<void>;
};

export function memoryKeyValueStore(): KeyValueWriter & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    async put(key, value) {
      entries.set(key, value);
    }
  };
}

export async function writeHostPrefix(store: KeyValueWriter, host: string, prefix: string) {
  await store.put(host.toLowerCase(), prefix.endsWith("/") ? prefix : `${prefix}/`);
}

const TEN_MINUTES = 10 * 60 * 1000;
const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

export function dueForRecheck(
  domain: { status: string; createdAt: Date; lastCheckedAt: Date | null },
  now: Date
): boolean {
  if (domain.status === "active" || domain.status === "error") return false;
  if (now.getTime() - domain.createdAt.getTime() > SEVENTY_TWO_HOURS) return false;
  if (!domain.lastCheckedAt) return true;
  return now.getTime() - domain.lastCheckedAt.getTime() >= TEN_MINUTES;
}
