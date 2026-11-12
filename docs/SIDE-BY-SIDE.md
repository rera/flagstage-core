# Side by side

Compared with the commercial account portal (`apps/account`) and admin site and customer pages in the flagstage-ui export, plus the production admin screenshots. Core stays light, self-serve, and without plans, billing, review queues, or agency tools.

## Site

| Commercial             | What it shows                                                            | Core                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Account home site card | Preview, live state, domain, SSL, last change, visit, domain settings    | Site overview: live status, host, when the current version was published, domain status, and a way into the editor |
| Account home requests  | Needs you, in progress, review preview                                   | Left out. Core has no review queue                                                                                 |
| Admin site detail      | Readiness, domains, snapshot activity, settings                          | Overview history with Restore, domain status, time zone on site settings                                           |
| Admin site detail      | Plugins, subscription, export ZIP, jobs, reassign, archive, fresh import | Left out                                                                                                           |
| Account domain page    | DNS connection and SSL                                                   | Existing Domain page, linked from the site, not the editor                                                         |
| Account forms          | Form plugin submissions                                                  | Forms count and submissions, linked from the site                                                                  |
| —                      | —                                                                        | Upcoming schedules and a 7-day analytics glance. Core already had the full pages                                   |
| Admin customer users   | People on the customer                                                   | People with access, from the account membership                                                                    |

## Account

| Commercial                                        | What it shows                  | Core                                                                    |
| ------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Customer detail                                   | Sites the customer owns        | Account page lists those sites, with status, linking to each overview   |
| Customer users and invites                        | People, roles, pending invites | Same, with the existing invite link                                     |
| Customer billing and plan                         | Plan, payment, allowance       | Left out. The account shows estimated model cost and the monthly budget |
| Customer contact, notes, terms, act-as, archive   | Operator tools                 | Left out                                                                |
| Account billing, notifications, profile, security | Commercial account chrome      | Left out. Sign-in and the install admin settings cover what Core has    |

## Editor

The commercial home mixes the composer with the site. Core keeps the editor as one action, "Make changes". The editor header is Publish now, Schedule, and Undo. Domain, Forms, Analytics, Scheduled, and Settings stay on the site.
