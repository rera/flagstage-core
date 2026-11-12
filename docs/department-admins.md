<!-- copy-review: required before announce -->

# Assign department admins

About five minutes. You need an organization admin signed in, and an identity provider that speaks OIDC or SAML.

1. Open Setup. Save the organization name and the base domain.
2. Paste the provider metadata. OIDC needs the issuer, client id, client secret, and email domain. SAML needs the sign-on URL and the signing certificate. Copy the redirect URL from the page into the identity provider.
3. Create an account for the department. The slug is the name in lowercase, with spaces turned into hyphens.
4. In the identity provider, put that department's admins in a group. Copy the group's id, not its display name.
5. Map that group id to the account and the role Account admin. Skip the display name. It is a label only.

The next time someone in that group signs in, they can import and publish for that account. A person in no mapped group, and with no invitation, sees "No access yet".

The same steps are on the command line:

```bash
flagstage admin add --email you@example.com --name "You"
flagstage account create "Parks"
flagstage member add --email editor@example.com --account parks --role editor
flagstage import https://example.com --account parks --name "Parks site"
```

`admin add` prints a password once when it creates the person. If the email already exists, it grants organization admin and leaves the password alone. `member add` does the same for an account role (`account_admin`, `editor`, or `reviewer`) and keeps the membership when the directory sync runs.

`flagstage user reset-password --email you@example.com` prints a new password. It runs in local development. In production it runs only when `FLAGSTAGE_BREAK_GLASS=1` is set for that one command.
