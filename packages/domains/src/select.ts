import { cloudfrontDriver, noneDriver, type DomainsDriver } from "./drivers";

export async function selectDomainsDriver(config: {
  DOMAINS_DRIVER: "none" | "cloudfront-tenants";
  CLOUDFRONT_DISTRIBUTION_ID?: string;
  CLOUDFRONT_CONNECTION_GROUP_ID?: string;
  CLOUDFRONT_CONNECTION_GROUP_ENDPOINT?: string;
}): Promise<DomainsDriver> {
  const endpoint = config.CLOUDFRONT_CONNECTION_GROUP_ENDPOINT || "d111111abcdef8.cloudfront.net";
  if (config.DOMAINS_DRIVER !== "cloudfront-tenants") return noneDriver(endpoint);
  if (!config.CLOUDFRONT_DISTRIBUTION_ID || !config.CLOUDFRONT_CONNECTION_GROUP_ID) {
    throw new Error("CloudFront distribution id and connection group id are required.");
  }
  const { createAwsTenantClient } = await import("./aws-tenant");
  return cloudfrontDriver({
    client: createAwsTenantClient(),
    distributionId: config.CLOUDFRONT_DISTRIBUTION_ID,
    connectionGroupId: config.CLOUDFRONT_CONNECTION_GROUP_ID,
    endpoint
  });
}
