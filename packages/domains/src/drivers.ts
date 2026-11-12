import type { DnsRecord } from "./records";
import { goLiveRecords, recordsForHostname } from "./records";

export type TenantSnapshot = {
  tenantId: string;
  distributionStatus: string;
  certificateStatus: string | null;
  validationRecords: DnsRecord[];
};

/** The subset of the CloudFront client the adapter needs. Tests pass a fake. */
export type TenantClient = {
  createTenant(input: {
    distributionId: string;
    connectionGroupId: string;
    hostname: string;
  }): Promise<TenantSnapshot>;
  updateTenant(input: {
    distributionId: string;
    connectionGroupId: string;
    hostname: string;
    tenantId: string;
  }): Promise<TenantSnapshot>;
  readTenant(tenantId: string): Promise<TenantSnapshot>;
};

export type DomainProvision = {
  tenantId: string | null;
  records: DnsRecord[];
  certificateStatus: string | null;
  distributionStatus: string | null;
};

export type DomainsDriver = {
  provision(hostname: string): Promise<DomainProvision>;
  update(tenantId: string, hostname: string): Promise<DomainProvision>;
  read(tenantId: string, hostname: string): Promise<DomainProvision>;
};

const FAILED_CERTIFICATES = new Set(["failed", "revoked", "expired", "validation-timed-out"]);

export function domainStatus(
  records: DnsRecord[],
  certificateStatus: string | null,
  distributionStatus: string | null
): "active" | "verifying" | "error" {
  if (certificateStatus && FAILED_CERTIFICATES.has(certificateStatus)) return "error";
  const dnsReady = records.length > 0 && records.every((record) => record.found);
  const certificateReady = certificateStatus == null || certificateStatus === "issued";
  const deployed = distributionStatus == null || distributionStatus === "Deployed";
  return dnsReady && certificateReady && deployed ? "active" : "verifying";
}

function localProvision(hostname: string, endpoint: string): DomainProvision {
  return {
    tenantId: null,
    certificateStatus: null,
    distributionStatus: null,
    records: goLiveRecords(hostname, { cloudfrontDomain: endpoint, apexAddresses: [] })
  };
}

export function noneDriver(endpoint: string): DomainsDriver {
  return {
    async provision(hostname) {
      return localProvision(hostname, endpoint);
    },
    async update(_tenantId, hostname) {
      return localProvision(hostname, endpoint);
    },
    async read(_tenantId, hostname) {
      return localProvision(hostname, endpoint);
    }
  };
}

function fromSnapshot(
  hostname: string,
  endpoint: string,
  snapshot: TenantSnapshot
): DomainProvision {
  return {
    tenantId: snapshot.tenantId,
    certificateStatus: snapshot.certificateStatus,
    distributionStatus: snapshot.distributionStatus,
    records: recordsForHostname(hostname, snapshot.validationRecords, {
      cloudfrontDomain: endpoint,
      apexAddresses: []
    })
  };
}

export function cloudfrontDriver(input: {
  client: TenantClient;
  distributionId: string;
  connectionGroupId: string;
  endpoint: string;
}): DomainsDriver {
  const target = {
    distributionId: input.distributionId,
    connectionGroupId: input.connectionGroupId
  };
  return {
    async provision(hostname) {
      return fromSnapshot(
        hostname,
        input.endpoint,
        await input.client.createTenant({ ...target, hostname })
      );
    },
    async update(tenantId, hostname) {
      return fromSnapshot(
        hostname,
        input.endpoint,
        await input.client.updateTenant({ ...target, hostname, tenantId })
      );
    },
    async read(tenantId, hostname) {
      return fromSnapshot(hostname, input.endpoint, await input.client.readTenant(tenantId));
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
