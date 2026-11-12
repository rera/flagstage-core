# Roles

| Action                                                     | Organization admin | Account admin | Editor | Reviewer |
| ---------------------------------------------------------- | ------------------ | ------------- | ------ | -------- |
| Organization settings, accounts, group mappings, SSO, SCIM | yes                |               |        |          |
| Members, sites, domains, and forms in the account          | yes                | yes           |        |          |
| Chat, request a change, approve, publish, roll back        | yes                | yes           | yes    |          |
| Read, view a preview, comment                              | yes                | yes           | yes    | yes      |

A person can belong to more than one account. Someone with no mapped group and no invite sees a page that says they do not have access.

The matrix is enforced by `can()` and covered by tests once that module lands.
