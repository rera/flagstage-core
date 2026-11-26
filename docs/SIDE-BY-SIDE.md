# Side by side

Compared with the commercial account portal (`apps/account`) and admin site and customer pages in the flagstage-ui export, plus the production admin screenshots. Core stays light, self-serve, and without plans, billing, review queues, or agency tools.

## Navigation

| Who            | Sidebar                                                                                      | Can do                                            |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Account member | One account. Open site sections. All sites, People, Skills, and Usage stay on the account    | Read that account's sites, people, and usage      |
| Account admin  | The same. New site in the site switcher. Account switcher only with two or more accounts     | Import, invite, and publish inside those accounts |
| Org admin      | That account, plus Admin: Accounts, Sites, People, Usage, Settings, and the account switcher | Every account, and the install settings           |

The top of the sidebar is Account › Site. A selected site shows Make changes, Overview, Plugins, Analytics, Scheduled, and Settings. People, Skills, Domain, and the time zone are tabs on Settings. Forms opens from Plugins. All sites, People, Skills, and Usage stay on the account: in the sidebar when no site is selected, and in the site picker under the account name when one is. A person in one account has no account switcher. An org admin's Accounts list lives in the Admin group. One site in an account opens on that overview. The desktop sidebar collapses to an icon rail. Addresses look like `/a/harbor/sites/{site}`. Old People, Skills, and Domain addresses redirect to their Settings tabs.

## Site

| Commercial             | What it shows                                                            | Core                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Account home site card | Preview, live state, domain, SSL, last change, visit, domain settings    | Site overview: live status, host, when the current version was published, domain status, and a way into the editor |
| Account home requests  | Needs you, in progress, review preview                                   | Left out. Core has no review queue                                                                                 |
| Admin site detail      | Readiness, domains, snapshot activity, settings                          | Overview history with Restore, domain status, time zone on site settings                                           |
| Admin site detail      | Plugins, subscription, export ZIP, jobs, reassign, archive, fresh import | Left out                                                                                                           |
| Account domain page    | DNS connection and SSL                                                   | Existing Domain page, linked from the site, not the editor                                                         |
| Account forms          | Form plugin submissions                                                  | Forms count on Overview, and the Forms screen opened from Plugins                                                  |
| —                      | —                                                                        | Upcoming schedules and a 7-day analytics glance. Core already had the full pages                                   |
| Admin customer users   | People on the customer                                                   | People on the site, with Owner, Editor, Viewer, Analyst, or Account admin                                          |

## Account

| Commercial                                        | What it shows                  | Core                                                                    |
| ------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Customer detail                                   | Sites the customer owns        | Account page lists those sites, with status, linking to each overview   |
| Customer users and invites                        | People, roles, pending invites | Same, with the existing invite link                                     |
| Customer billing and plan                         | Plan, payment, allowance       | Left out. The account shows estimated model cost and the monthly budget |
| Customer contact, notes, terms, act-as, archive   | Operator tools                 | Left out                                                                |
| Account billing, notifications, profile, security | Commercial account chrome      | Left out. Sign-in and the install admin settings cover what Core has    |

## Editor

The commercial home mixes the composer with the site. Core keeps the editor as one action, "Make changes". The editor header is Publish now, Schedule, and Undo. Plugins, Analytics, Scheduled, and Settings stay on the site. Domain is a Settings tab, and Forms opens from Plugins.
