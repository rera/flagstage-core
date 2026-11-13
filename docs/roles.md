# Roles

An org admin can do every action. An account admin can do every action inside the accounts they belong to. A member can read those accounts. Someone with no account and no admin role sees a page that says they do not have access.

| Action                                                         | Org admin | Account admin | Member |
| -------------------------------------------------------------- | --------- | ------------- | ------ |
| Promote or remove an admin, budgets, and the install usage log | yes       |               |        |
| Members, invites, sites, domains, and forms                    | yes       | yes           |        |
| Read sites, people, and usage                                  | yes       | yes           | yes    |
| Chat, preview, publish, and roll back                          | yes       | yes           |        |

The sidebar follows the same split.

| Who            | Sidebar                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| Account member | One account. Site sections when a site is open, plus All sites, People, and Usage. Read only |
| Account admin  | The same. Site switcher includes New site. Account switcher only with two or more accounts   |
| Org admin      | That account, plus Admin: Accounts, Sites, People, Usage, Settings, and the account switcher |

Addresses look like `/a/harbor/sites/{site}`. A member who opens another account's address gets no access. `can()` in `@flagstage/core` is the check the app uses.
