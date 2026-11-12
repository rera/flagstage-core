<!-- copy-review: required before announce -->

# SSO and SCIM

Sign-in is OIDC or SAML 2.0. Provisioning is SCIM 2.0. Any identity provider that speaks those standards can be used. Flagstage Core does not ship a client for a specific vendor. The examples below use placeholder hostnames.

An organization admin saves a provider under Setup or Settings. Saving calls Better Auth's register endpoint, or its update endpoint when that provider id already exists. OIDC registration reads the issuer's discovery document. The five-minute path for a department is [Assign department admins](department-admins.md). Group mappings use the identity provider's immutable group id (`externalId`), never the display name. A mapped group grants `org_admin` or an account role (`account_admin`, `editor`, `reviewer`). A person with no mapped group and no invitation sees "No access yet".

## Redirect and ACS

Replace `{providerId}` with the provider id you saved.

| Use           | URL                                                |
| ------------- | -------------------------------------------------- |
| OIDC redirect | `{APP_URL}/api/auth/sso/callback/{providerId}`     |
| SAML ACS      | `{APP_URL}/api/auth/sso/saml2/sp/acs/{providerId}` |
| SCIM base     | `{APP_URL}/api/auth/scim/v2`                       |

The groups claim on the OIDC userinfo response (or the SAML attribute named `groups`) is a list of group ids. Just-in-time sign-in reconciles those ids on every login. Manual and bootstrap memberships are left in place.

## SCIM token

Settings → Create SCIM token shows the bearer token once. Send it as `Authorization: Bearer`. Create users at `POST /api/auth/scim/v2/Users` and groups at `POST /api/auth/scim/v2/Groups`. A group's `externalId` must match a mapping. Deactivating a user removes their access.

## First admin

Set `BOOTSTRAP_ADMIN_EMAIL`. On an empty database the log prints a one-time link, `{APP_URL}/bootstrap?token=…`. The link signs that person in as organization admin and then stops working.
