# Invite account admins

An admin creates an account, then invites the people who run it. Each invite makes that person an account admin.

1. Sign in as an admin.
2. Create the account.
3. Open the account and invite the person by email. Send them the link. It is shown once.
4. They set a password from that link if they do not already have one, then they can import sites and publish.

From a shell:

```bash
flagstage account create "Parks"
flagstage member add --email parks@example.com --account parks
```

`admin add` prints a password once when it creates the person. If the email already exists, it grants admin and leaves the password alone. `member add` grants account admin on that account. `flagstage member add --role member` grants read access to that account's sites, people, and usage.

<!-- copy-review: required before announce -->
