import {
  CreateDistributionTenantCommand,
  GetManagedCertificateDetailsCommand,
  UpdateDistributionTenantCommand
} from "@aws-sdk/client-cloudfront";
import { describe, expect, it } from "vitest";

import { createAwsTenantClient, type CloudFrontSender } from "./aws-tenant";
import { cloudfrontDriver, domainStatus } from "./drivers";

const validation = {
  ManagedCertificateDetails: {
    CertificateStatus: "pending-validation",
    ValidationTokenDetails: [
      {
        Domain: "www.example.com",
        RedirectFrom: "_acme.www.example.com.",
        RedirectTo: "_token.acm-validations.aws."
      }
    ]
  }
};

function scripted(responses: unknown[]) {
  const commands: Array<{ constructor: { name: string }; input: Record<string, unknown> }> = [];
  const sender: CloudFrontSender = {
    async send(command) {
      commands.push(command as { constructor: { name: string }; input: Record<string, unknown> });
      const next = responses.shift();
      return (next ?? {}) as Awaited<ReturnType<CloudFrontSender["send"]>>;
    }
  };
  return { sender, commands };
}

describe("CloudFront tenant client", () => {
  it("creates a tenant with a self-hosted managed certificate", async () => {
    const { sender, commands } = scripted([
      { DistributionTenant: { Id: "dt_1", Status: "InProgress" } },
      validation
    ]);
    const created = await createAwsTenantClient(sender).createTenant({
      distributionId: "EDFDVBD6EXAMPLE",
      connectionGroupId: "cg_1",
      hostname: "www.example.com"
    });
    expect(commands.map((command) => command.constructor.name)).toEqual([
      "CreateDistributionTenantCommand",
      "GetManagedCertificateDetailsCommand"
    ]);
    expect(commands[0]).toBeInstanceOf(CreateDistributionTenantCommand);
    expect(commands[0]?.input).toMatchObject({
      DistributionId: "EDFDVBD6EXAMPLE",
      ConnectionGroupId: "cg_1",
      Domains: [{ Domain: "www.example.com" }],
      Enabled: true,
      ManagedCertificateRequest: {
        ValidationTokenHost: "self-hosted",
        PrimaryDomainName: "www.example.com",
        CertificateTransparencyLoggingPreference: "enabled"
      }
    });
    expect(String(commands[0]?.input.Name)).toMatch(/^site-www-example-com-[a-f0-9]+$/);
    expect(created.tenantId).toBe("dt_1");
    expect(created.certificateStatus).toBe("pending-validation");
    expect(created.validationRecords[0]).toMatchObject({
      name: "_acme.www.example.com",
      value: "_token.acm-validations.aws",
      purpose: "acm_validation"
    });
  });

  it("updates an existing tenant and reads the certificate into the checklist", async () => {
    const { sender, commands } = scripted([
      { DistributionTenant: { Id: "dt_1", Status: "Deployed" }, ETag: "etag-1" },
      { DistributionTenant: { Id: "dt_1", Status: "InProgress" }, ETag: "etag-2" },
      validation,
      { DistributionTenant: { Id: "dt_1", Status: "Deployed" }, ETag: "etag-3" },
      { ManagedCertificateDetails: { CertificateStatus: "issued", ValidationTokenDetails: [] } }
    ]);
    const driver = cloudfrontDriver({
      client: createAwsTenantClient(sender),
      distributionId: "EDFDVBD6EXAMPLE",
      connectionGroupId: "cg_1",
      endpoint: "d111.cloudfront.net"
    });
    const updated = await driver.update("dt_1", "www.example.com");
    expect(commands.slice(0, 3).map((command) => command.constructor.name)).toEqual([
      "GetDistributionTenantCommand",
      "UpdateDistributionTenantCommand",
      "GetManagedCertificateDetailsCommand"
    ]);
    expect(commands[1]).toBeInstanceOf(UpdateDistributionTenantCommand);
    expect(commands[1]?.input).toMatchObject({
      Id: "dt_1",
      IfMatch: "etag-1",
      DistributionId: "EDFDVBD6EXAMPLE",
      ConnectionGroupId: "cg_1",
      Domains: [{ Domain: "www.example.com" }],
      ManagedCertificateRequest: { PrimaryDomainName: "www.example.com" }
    });
    expect(updated.records.map((record) => record.purpose).sort()).toEqual([
      "acm_validation",
      "cdn_alias"
    ]);
    const read = await driver.read("dt_1", "www.example.com");
    expect(commands.at(-1)).toBeInstanceOf(GetManagedCertificateDetailsCommand);
    expect(read.certificateStatus).toBe("issued");
    expect(read.distributionStatus).toBe("Deployed");
    const checked = read.records.map((record) => ({ ...record, found: true }));
    expect(domainStatus(checked, read.certificateStatus, read.distributionStatus)).toBe("active");
  });

  it("marks a failed certificate as an error even when DNS matches", () => {
    expect(
      domainStatus(
        [
          {
            type: "CNAME",
            name: "www.example.com",
            value: "d111.cloudfront.net",
            purpose: "cdn_alias",
            found: true
          }
        ],
        "failed",
        "Deployed"
      )
    ).toBe("error");
  });
});
