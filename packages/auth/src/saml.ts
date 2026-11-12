export type SamlProviderInput = {
  providerId: string;
  domain: string;
  issuer: string;
  entryPoint: string;
  certificate: string;
  callbackUrl?: string;
};

/** Standards-only SAML 2.0 provider record. Callers supply the IdP's own values. */
export function samlProviderConfig(input: SamlProviderInput) {
  return {
    providerId: input.providerId,
    issuer: input.issuer,
    domain: input.domain,
    samlConfig: {
      issuer: input.callbackUrl ?? `https://${input.domain}`,
      entryPoint: input.entryPoint,
      cert: input.certificate,
      wantAssertionsSigned: true,
      idpMetadata: {
        entityID: input.issuer,
        cert: input.certificate
      },
      callbackUrl: input.callbackUrl
    }
  };
}
