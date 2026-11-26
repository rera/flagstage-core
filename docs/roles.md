# Roles

Access is platform, then account, then site.

An org admin can do every action. An account admin can do every action inside the accounts they belong to, including every site in those accounts. A member can read those accounts. A site role applies to one site. Someone with no account, no site role, and no admin role sees a page that says they do not have access.

| Action                                         | Org admin | Account admin | Member | Owner | Editor | Viewer | Analyst |
| ---------------------------------------------- | --------- | ------------- | ------ | ----- | ------ | ------ | ------- |
| Promote or remove an admin, budgets, usage log | yes       |               |        |       |        |        |         |
| Account people, new sites, and account skills  | yes       | yes           |        |       |        |        |         |
| Read sites, people, and usage                  | yes       | yes           | yes    |       |        |        |         |
| Chat edits                                     | yes       | yes           |        | yes   | yes    |        |         |
| Publish and go live                            | yes       | yes           |        | yes   | yes    |        |         |
| Domain                                         | yes       | yes           |        | yes   |        |        |         |
| Site people                                    | yes       | yes           |        | yes   |        |        |         |
| Edit site skills                               | yes       | yes           |        | yes   | yes    |        |         |
| Read skills                                    | yes       | yes           | yes    | yes   | yes    | yes    | yes     |
| Stats                                          | yes       | yes           | yes    | yes   | yes    |        | yes     |

An account admin does not need a site role. The check treats them as allowed on every site in the account.

A site keeps at least one Owner. The last Owner can be removed or given another role only when the account already has an account admin. Removing the last account admin is refused when any site in the account has no Owner. A platform admin does not count as that cover.

The sidebar follows the same split. People and Skills are their own items. Settings has no tabs for them.

| Who            | Sidebar                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Site role      | That site. People and Skills are in the site section. No account section unless they also belong to the account    |
| Account member | One account. Site sections when a site is open, plus All sites, People, Skills, and Usage. Read only               |
| Account admin  | The same, and they can change it. Site switcher includes New site. Account switcher only with two or more accounts |
| Org admin      | That account, plus Admin: Accounts, Sites, People, Usage, Settings, and the account switcher                       |

Addresses look like `/a/harbor/sites/{site}`. A person who opens another account's address gets no access. `can()` in `@flagstage/core` is the check the app uses.

Account skills are stored on the account. The site editor follows them on every site in the account, in addition to the skills in each site's `.flagstage/skills` directory. Site skill saves are a new snapshot, the same path as any other file change.
