import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { samlProviderConfig } from "./saml";

describe("SAML provider config", () => {
  it("is a standards config with issuer, entry point, and certificate", () => {
    const config = samlProviderConfig({
      providerId: "directory",
      domain: "example.com",
      issuer: "https://idp.example.com/metadata",
      entryPoint: "https://idp.example.com/sso",
      certificate: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"
    });
    expect(config.providerId).toBe("directory");
    expect(config.samlConfig.entryPoint).toContain("/sso");
    expect(config.samlConfig.cert).toContain("BEGIN CERTIFICATE");
    expect(config.samlConfig.idpMetadata.entityID).toContain("idp.example.com");
    expect(config.samlConfig.wantAssertionsSigned).toBe(true);
  });

  it("does not name a vendor in auth source", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const source = ["create-auth.ts", "saml.ts", "bootstrap.ts"]
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n")
      .toLowerCase();
    expect(source).not.toMatch(/okta|entra|onelogin/);
  });
});
