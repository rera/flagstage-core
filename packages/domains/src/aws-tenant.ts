import { randomBytes } from "node:crypto";

import {
  CloudFrontClient,
  CreateDistributionTenantCommand,
  GetDistributionTenantCommand,
  GetManagedCertificateDetailsCommand,
  UpdateDistributionTenantCommand
} from "@aws-sdk/client-cloudfront";

import type { TenantClient, TenantSnapshot } from "./drivers";
import type { DnsRecord } from "./records";

type CertificateDetails = {
  CertificateStatus?: string;
  ValidationTokenDetails?: Array<{
    RedirectFrom?: string;
    RedirectTo?: string;
  }>;
};

type TenantResult = {
  DistributionTenant?: { Id?: string; Status?: string };
  ETag?: string;
  ManagedCertificateDetails?: CertificateDetails;
};

export type CloudFrontSender = {
  send(command: unknown): Promise<TenantResult>;
};

function tenantName(hostname: string): string {
  const slug = hostname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `site-${slug}-${randomBytes(3).toString("hex")}`.slice(0, 128);
}

function managedCertificate(hostname: string) {
  return {
    ValidationTokenHost: "self-hosted" as const,
    PrimaryDomainName: hostname,
    CertificateTransparencyLoggingPreference: "enabled" as const
  };
}

function validationRecords(details: CertificateDetails | undefined): DnsRecord[] {
  const records: DnsRecord[] = [];
  for (const token of details?.ValidationTokenDetails ?? []) {
    if (!token.RedirectFrom || !token.RedirectTo) continue;
    records.push({
      type: "CNAME",
      name: token.RedirectFrom.replace(/\.$/, ""),
      value: token.RedirectTo.replace(/\.$/, ""),
      purpose: "acm_validation"
    });
  }
  return records;
}

function snapshotOf(
  tenantId: string,
  distributionStatus: string | undefined,
  details: CertificateDetails | undefined
): TenantSnapshot {
  return {
    tenantId,
    distributionStatus: distributionStatus ?? "InProgress",
    certificateStatus: details?.CertificateStatus ?? null,
    validationRecords: validationRecords(details)
  };
}

export function createAwsTenantClient(sender?: CloudFrontSender): TenantClient {
  const cloudfront = sender ?? new CloudFrontClient({ region: "us-east-1" });
  return {
    async createTenant(input) {
      const created = await cloudfront.send(
        new CreateDistributionTenantCommand({
          DistributionId: input.distributionId,
          Name: tenantName(input.hostname),
          Domains: [{ Domain: input.hostname }],
          ConnectionGroupId: input.connectionGroupId,
          Enabled: true,
          ManagedCertificateRequest: managedCertificate(input.hostname)
        })
      );
      const tenantId = created.DistributionTenant?.Id;
      if (!tenantId) throw new Error("CloudFront did not return a tenant id.");
      const details = await cloudfront.send(
        new GetManagedCertificateDetailsCommand({ Identifier: tenantId })
      );
      return snapshotOf(
        tenantId,
        created.DistributionTenant?.Status,
        details.ManagedCertificateDetails
      );
    },
    async updateTenant(input) {
      const current = await cloudfront.send(
        new GetDistributionTenantCommand({ Identifier: input.tenantId })
      );
      if (!current.ETag) throw new Error("CloudFront did not return a tenant version.");
      const updated = await cloudfront.send(
        new UpdateDistributionTenantCommand({
          Id: input.tenantId,
          IfMatch: current.ETag,
          DistributionId: input.distributionId,
          ConnectionGroupId: input.connectionGroupId,
          Domains: [{ Domain: input.hostname }],
          Enabled: true,
          ManagedCertificateRequest: managedCertificate(input.hostname)
        })
      );
      const details = await cloudfront.send(
        new GetManagedCertificateDetailsCommand({ Identifier: input.tenantId })
      );
      return snapshotOf(
        input.tenantId,
        updated.DistributionTenant?.Status ?? current.DistributionTenant?.Status,
        details.ManagedCertificateDetails
      );
    },
    async readTenant(tenantId) {
      const current = await cloudfront.send(
        new GetDistributionTenantCommand({ Identifier: tenantId })
      );
      const details = await cloudfront.send(
        new GetManagedCertificateDetailsCommand({ Identifier: tenantId })
      );
      const id = current.DistributionTenant?.Id ?? tenantId;
      return snapshotOf(id, current.DistributionTenant?.Status, details.ManagedCertificateDetails);
    }
  };
}
