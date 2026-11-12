import { describe, expect, it } from "vitest";

import { checkDnsRecords } from "./dns-check";
import {
  cloudfrontDriver,
  dueForRecheck,
  memoryKeyValueStore,
  noneDriver,
  writeHostPrefix
} from "./drivers";
import { isApexHostname } from "./hostname";
import { goLiveRecords } from "./records";

const lookup = {
  async cname(name: string) {
    if (name === "www.example.com") return ["d111.cloudfront.net."];
    return [];
  },
  async ipv4(name: string) {
    if (name === "example.com" || name === "d111.cloudfront.net") return ["1.2.3.4", "5.6.7.8"];
    if (name === "shop.example.com") return ["9.9.9.9"];
    return [];
  }
};

describe("dns records", () => {
  it("uses a CNAME for www and subdomains, and ALIAS or A for an apex", () => {
    expect(isApexHostname("example.com")).toBe(true);
    expect(isApexHostname("www.example.com")).toBe(false);
    expect(
      goLiveRecords("www.example.com", {
        cloudfrontDomain: "d111.cloudfront.net",
        apexAddresses: []
      })
    ).toEqual([
      { type: "CNAME", name: "www.example.com", value: "d111.cloudfront.net", purpose: "cdn_alias" }
    ]);
    expect(
      goLiveRecords("docs.example.com", {
        cloudfrontDomain: "d111.cloudfront.net",
        apexAddresses: []
      })[0]?.type
    ).toBe("CNAME");
    expect(
      goLiveRecords("example.com", {
        cloudfrontDomain: "d111.cloudfront.net",
        apexAddresses: []
      })[0]?.type
    ).toBe("ALIAS");
    expect(
      goLiveRecords("example.com", {
        cloudfrontDomain: "d111.cloudfront.net",
        apexAddresses: ["1.2.3.4"]
      })
    ).toEqual([{ type: "A", name: "example.com", value: "1.2.3.4", purpose: "cdn_alias" }]);
  });

  it("marks CNAME, A, and ALIAS records from a stub resolver", async () => {
    const checked = await checkDnsRecords(
      [
        {
          type: "CNAME",
          name: "www.example.com",
          value: "d111.cloudfront.net",
          purpose: "cdn_alias"
        },
        { type: "A", name: "shop.example.com", value: "1.2.3.4", purpose: "cdn_alias" },
        { type: "ALIAS", name: "example.com", value: "d111.cloudfront.net", purpose: "cdn_alias" }
      ],
      lookup
    );
    expect(checked[0]?.found).toBe(true);
    expect(checked[1]?.found).toBe(false);
    expect(checked[1]?.current).toEqual(["9.9.9.9"]);
    expect(checked[2]?.found).toBe(true);
  });

  it("creates a tenant through the CloudFront client and skips it for the none driver", async () => {
    const calls: string[] = [];
    const cloud = cloudfrontDriver({
      distributionId: "dist",
      connectionGroupId: "group",
      endpoint: "d111.cloudfront.net",
      client: {
        async createTenant(input) {
          calls.push(input.hostname);
          return {
            tenantId: "tenant-1",
            distributionStatus: "InProgress",
            certificateStatus: "pending-validation",
            validationRecords: [
              {
                type: "CNAME",
                name: "_acme.www.example.com",
                value: "_token.acm-validations.aws",
                purpose: "acm_validation"
              }
            ]
          };
        },
        async updateTenant() {
          throw new Error("unused");
        },
        async readTenant() {
          throw new Error("unused");
        }
      }
    });
    const provisioned = await cloud.provision("www.example.com");
    expect(calls).toEqual(["www.example.com"]);
    expect(provisioned.tenantId).toBe("tenant-1");
    expect(provisioned.records.map((record) => record.purpose).sort()).toEqual([
      "acm_validation",
      "cdn_alias"
    ]);
    const local = await noneDriver("d111.cloudfront.net").provision("www.example.com");
    expect(local.tenantId).toBeNull();
    expect(local.records).toHaveLength(1);
  });

  it("writes the live prefix into the host map", async () => {
    const store = memoryKeyValueStore();
    await writeHostPrefix(store, "WWW.Example.com", "snapshots/site/snap");
    expect(store.entries.get("www.example.com")).toBe("snapshots/site/snap/");
  });

  it("rechecks a pending domain every 10 minutes for 72 hours", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const domain = { status: "pending", createdAt: created, lastCheckedAt: null as Date | null };
    expect(dueForRecheck(domain, new Date("2026-01-01T00:05:00Z"))).toBe(true);
    expect(
      dueForRecheck(
        { ...domain, lastCheckedAt: new Date("2026-01-01T00:00:00Z") },
        new Date("2026-01-01T00:09:00Z")
      )
    ).toBe(false);
    expect(
      dueForRecheck(
        { ...domain, lastCheckedAt: new Date("2026-01-01T00:00:00Z") },
        new Date("2026-01-01T00:10:00Z")
      )
    ).toBe(true);
    expect(dueForRecheck(domain, new Date("2026-01-04T00:01:00Z"))).toBe(false);
    expect(dueForRecheck({ ...domain, status: "active" }, created)).toBe(false);
  });
});
