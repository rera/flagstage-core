import type { SkillCard } from "./skills-ui";

/**
 * One skill file, front matter included. The editors show this string as-is.
 * The page title and the scope line stay outside it.
 */
const bodies: Record<string, string> = {
  "event-facts": `# Event facts

Use these facts when a page mentions the event. Do not invent a date, a course, or a winner.

## This championship

- Event: PGA Championship
- Site: pgachampionship.com
- Dates: May 14–17, 2026
- Course: Aronimink Golf Club

## How to use them

- Name the course the first time it appears on a page.
- Keep the dates together on one line.
- Do not add a winner, a purse, or a weather line.

## Leave out

- Do not guess a tee time.
- Do not name a player unless the page is a player page.`,
  "brand-voice": `# Brand voice

Short sentences. The account sounds calm and specific.

## Headlines

- Headlines name the event.
- Say "championship" in a headline. Do not say "tournament" there.
- Do not use an exclamation mark.

## Names

- Use the official event names in Naming rules.
- Write the apostrophe in Women's. Do not write Womens.
- Do not shorten PGA Championship to PGA in a headline.
- Do not name a player unless the page is a player page.

## Body

- Lead with the fact, then the detail.
- Do not open a page with "Welcome" or "We're excited".
- Keep each sponsor line with the sponsor it belongs to.`
};

export function skillSource(skill: SkillCard): string {
  const body = (bodies[skill.slug] ?? skill.body).replace(/\s+$/, "");
  const name = skill.name.replace(/"/g, "'").trim() || "Skill";
  const description = skill.description.replace(/"/g, "'");
  return `---\nname: "${name}"\ndescription: "${description}"\n---\n\n${body}\n`;
}

/** Cursor sits on the lead sentence, past the front matter and the title. */
export function skillEditAnchor(source: string): number {
  const lines = source.split("\n");
  let offset = 0;
  let fences = 0;
  for (const line of lines) {
    if (line.trim() === "---") fences += 1;
    const prose =
      fences >= 2 &&
      line.trim() !== "" &&
      line.trim() !== "---" &&
      !line.startsWith("#") &&
      !line.startsWith("-");
    if (prose) {
      const end = source.indexOf("\n", offset);
      return end === -1 ? source.length : end;
    }
    offset += line.length + 1;
  }
  return 0;
}
