/** Throwaway sample data for the piece-4 UI mock. Not a product feature. */

export type RoleId = "owner" | "editor" | "viewer" | "analyst";

export const roles: Array<{ id: RoleId; label: string; detail: string }> = [
  {
    id: "owner",
    label: "Owner",
    detail: "Manages people, the domain, and go-live."
  },
  {
    id: "editor",
    label: "Editor",
    detail: "Makes changes in chat and can publish."
  },
  {
    id: "viewer",
    label: "Viewer",
    detail: "Sees the site and its history."
  },
  {
    id: "analyst",
    label: "Analyst",
    detail: "Sees the site, its history, and stats."
  }
];

export function roleLabel(id: RoleId): string {
  return roles.find((role) => role.id === id)?.label ?? id;
}

export const accounts = [
  { id: "acct_championships", slug: "championships", name: "Championships" },
  { id: "acct_digital", slug: "digital", name: "Digital" }
];

export type MockSite = { id: string; name: string; status: string; host: string };

export const championshipSites: MockSite[] = [
  { id: "pga", name: "PGA Championship", status: "live", host: "pgachampionship.com" },
  {
    id: "womens",
    name: "Women's PGA Championship",
    status: "live",
    host: "womenspgachampionship.com"
  }
];

export const digitalSites: MockSite[] = [
  { id: "tour", name: "PGA TOUR", status: "live", host: "pgatour.com" },
  { id: "ryder", name: "Ryder Cup", status: "live", host: "rydercup.com" }
];

export type Person = {
  name: string;
  email: string;
  role: RoleId;
};

export const accountLeads: Person[] = [
  { name: "Alex Morgan", email: "alex.morgan@example.com", role: "owner" },
  { name: "Avery Nguyen", email: "avery.nguyen@example.com", role: "owner" }
];

export const pgaPeople: Person[] = [
  { name: "Jordan Lee", email: "jordan.lee@example.com", role: "owner" },
  { name: "Sam Patel", email: "sam.patel@example.com", role: "editor" },
  { name: "Riley Chen", email: "riley.chen@example.com", role: "viewer" },
  { name: "Morgan Blake", email: "morgan.blake@example.com", role: "analyst" }
];

export const womensPeople: Person[] = [
  { name: "Taylor Kim", email: "taylor.kim@example.com", role: "owner" },
  { name: "Quinn Alvarez", email: "quinn.alvarez@example.com", role: "editor" },
  { name: "Riley Chen", email: "riley.chen@example.com", role: "viewer" }
];

export type HistoryEntry = {
  name: string;
  action: string;
  when: string;
  note: string;
};

export type Skill = {
  slug: string;
  name: string;
  description: string;
  file?: string;
  body: string;
  history: HistoryEntry[];
};

export const accountSkills: Skill[] = [
  {
    slug: "brand-voice",
    name: "Brand voice",
    description: "How the account sounds in headlines and body text.",
    body: `Use short sentences.

Headlines name the event. They do not use an exclamation mark.

Say "championship" in headlines. Do not say "tournament" there.

Do not name a player unless the page is a player page.

Use the official event names in Naming rules.`,
    history: [
      {
        name: "Avery Nguyen",
        action: "Saved",
        when: "Nov 12, 2026, 4:10 PM ET",
        note: "Tightened the headline rule."
      },
      {
        name: "Alex Morgan",
        action: "Saved",
        when: "Sep 3, 2026, 1:26 PM ET",
        note: "Added the player-name rule."
      },
      {
        name: "Avery Nguyen",
        action: "Created",
        when: "Jun 16, 2026, 10:02 AM ET",
        note: "Added the skill."
      }
    ]
  },
  {
    slug: "legal-lines",
    name: "Legal lines",
    description: "Required lines and claims the agent must keep.",
    body: `Keep the footer legal line on every page.

Do not add a claim that is not in this skill.

The ticket line stays under the event dates. Do not shorten it.`,
    history: [
      {
        name: "Alex Morgan",
        action: "Saved",
        when: "Oct 8, 2026, 11:40 AM ET",
        note: "Added the ticket line."
      },
      {
        name: "Avery Nguyen",
        action: "Created",
        when: "Jun 16, 2026, 10:18 AM ET",
        note: "Added the skill."
      }
    ]
  },
  {
    slug: "naming-rules",
    name: "Naming rules",
    description: "Official names, and names to avoid.",
    body: `PGA Championship
Women's PGA Championship

Write the apostrophe in Women's. Do not write Womens.

Do not shorten PGA Championship to PGA in a headline.`,
    history: [
      {
        name: "Avery Nguyen",
        action: "Saved",
        when: "Aug 21, 2026, 2:05 PM ET",
        note: "Added Women's PGA Championship."
      },
      {
        name: "Alex Morgan",
        action: "Created",
        when: "Jun 16, 2026, 10:24 AM ET",
        note: "Added the skill."
      }
    ]
  }
];

export const pgaSkills: Skill[] = [
  {
    slug: "event-facts",
    name: "Event facts",
    description: "Dates, course, and other facts for this championship.",
    file: ".flagstage/skills/event-facts/SKILL.md",
    body: `Event: PGA Championship
Site: pgachampionship.com
Dates: May 14–17, 2026
Course: Aronimink Golf Club

Use these facts when a page mentions the event.
Do not invent a date, a course, or a winner.`,
    history: [
      {
        name: "Jordan Lee",
        action: "Saved",
        when: "Nov 24, 2026, 3:42 PM ET",
        note: "Updated the course name."
      },
      {
        name: "Sam Patel",
        action: "Saved",
        when: "Nov 18, 2026, 9:15 AM ET",
        note: "Added the event dates."
      },
      {
        name: "Jordan Lee",
        action: "Created",
        when: "Oct 2, 2026, 11:08 AM ET",
        note: "Added the skill."
      }
    ]
  },
  {
    slug: "page-structure",
    name: "Page structure",
    description: "Which pages exist, and which blocks are shared.",
    file: ".flagstage/skills/page-structure/SKILL.md",
    body: `Home, Schedule, Tickets, Course, and News are the main pages.

The header and the footer are shared. Change them once, not on each page.

Do not add a page that is not listed here.`,
    history: [
      {
        name: "Sam Patel",
        action: "Saved",
        when: "Nov 4, 2026, 8:55 AM ET",
        note: "Listed the main pages."
      },
      {
        name: "Jordan Lee",
        action: "Created",
        when: "Oct 2, 2026, 11:20 AM ET",
        note: "Added the skill."
      }
    ]
  },
  {
    slug: "sponsor-lines",
    name: "Sponsor lines",
    description: "Sponsor names and the lines that must stay with them.",
    file: ".flagstage/skills/sponsor-lines/SKILL.md",
    body: `Keep each sponsor name with its line. Do not move a line to another sponsor.

Do not drop a sponsor from the footer.`,
    history: [
      {
        name: "Jordan Lee",
        action: "Created",
        when: "Oct 9, 2026, 4:36 PM ET",
        note: "Added the skill."
      }
    ]
  }
];
