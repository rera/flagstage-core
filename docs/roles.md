# Roles

There are two roles.

| Action                                        | Admin | Account admin |
| --------------------------------------------- | ----- | ------------- |
| Promote or remove an admin, and the usage log | yes   |               |
| Members, invites, sites, domains, and forms   | yes   | yes           |
| Chat, preview, publish, and roll back         | yes   | yes           |

An admin can do every action. An account admin can do every action inside the accounts they belong to. Someone with no account and no admin role sees a page that says they do not have access.

`can()` in `@flagstage/core` is the check the app uses.
