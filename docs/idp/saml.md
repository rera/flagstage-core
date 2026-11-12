<!-- copy-review: required before announce -->

# SAML

Any identity provider that speaks SAML 2.0 can be used. Flagstage Core does not ship a client for a specific vendor. The [example values](example-values.md) table shows where three common products put the same fields.

An organization admin does this under Setup or Settings.

## In the identity provider

1. Create a SAML application.
2. Set the Assertion Consumer Service URL to `{APP_URL}/api/auth/sso/saml2/sp/acs/{providerId}`.
3. Copy the identity provider's sign-on URL, its entity id, and its signing certificate. The entity id is what Flagstage calls the issuer. It is not the ACS URL.
4. Send group ids in an attribute named `groups`. A display name is a label only.

## In Flagstage

1. Choose a provider id. It is part of the ACS URL.
2. Set the email domain of staff addresses.
3. Paste the issuer (the identity provider's entity id), the sign-on URL, and the signing certificate.
4. Save. Saving calls Better Auth's register endpoint, or its update endpoint when that provider id already exists.
5. Map a group id to a role, the same way as [OIDC](oidc.md).

Sign-in reads the `groups` attribute and reconciles those ids. A person in no mapped group, and with no invitation, sees "No access yet".
