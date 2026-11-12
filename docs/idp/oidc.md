<!-- copy-review: required before announce -->

# OIDC

Any identity provider that publishes an OpenID Connect discovery document can be used. Flagstage Core does not ship a client for a specific vendor. Example values for three common providers are in [example values](example-values.md). Those are names to paste, not code.

An organization admin does this under Setup or Settings.

## In the identity provider

1. Create a confidential web application.
2. Set the redirect URI to `{APP_URL}/api/auth/sso/callback/{providerId}`. `{providerId}` is the id you will type in Flagstage, and `{APP_URL}` is the app origin, such as `https://sites.example.com`.
3. Copy the issuer, the client id, and the client secret. The issuer is the URL whose `/.well-known/openid-configuration` document the app can fetch. Do not include a trailing slash.
4. Put group ids in a claim named `groups`. Display names are not used. If the token has no `groups` claim, sign-in can succeed and the person still sees "No access yet" until a group is mapped or someone invites them.

The app must be able to reach the discovery document. A private issuer that the app cannot fetch is not saved.

## In Flagstage

1. Choose a provider id. It becomes part of the redirect URI, so set the redirect URI again if you change it.
2. Set the email domain to the domain of staff addresses, such as `example.com`.
3. Paste the issuer, client id, and client secret.
4. Save. Saving calls Better Auth's register endpoint, which reads the discovery document and stores the endpoints. Saving the same provider id again updates it.
5. Map a group id to a role. The target is the whole organization (`org_admin`) or one account (`account_admin`, `editor`, or `reviewer`). Use the group's id, not its name.

The next sign-in for someone in that group applies the mapping. Memberships you added by hand stay in place.

SCIM is optional and separate. See [SSO and SCIM](../sso-scim.md).
