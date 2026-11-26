/** One directory segment. Skill names never include a path. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSkillSlug(value: string): boolean {
  return SLUG.test(value);
}

export function skillPath(slug: string): string {
  if (!isSkillSlug(slug)) throw new Error("Unknown skill.");
  return `.flagstage/skills/${slug}/SKILL.md`;
}

export type SkillFile = {
  name: string;
  description: string;
  body: string;
};

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Front matter holds the list title. The textarea is the markdown below it. */
export function parseSkillMarkdown(text: string, fallbackName: string): SkillFile {
  const source = text.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) {
    return { name: fallbackName, description: "", body: source.replace(/\s+$/, "") };
  }
  const front = match[1] ?? "";
  const name = unquote(/^name:\s*(.+)$/m.exec(front)?.[1] ?? "") || fallbackName;
  const description = unquote(/^description:\s*(.*)$/m.exec(front)?.[1] ?? "");
  return {
    name,
    description,
    body: (match[2] ?? "").replace(/^\r?\n/, "").replace(/\s+$/, "")
  };
}

export function writeSkillMarkdown(skill: SkillFile): string {
  const description = skill.description.replace(/"/g, "'");
  const name = skill.name.replace(/\s+/g, " ").trim() || "Skill";
  const body = skill.body.replace(/\s+$/, "");
  return `---\nname: ${name}\ndescription: "${description}"\n---\n\n${body}\n`;
}

export function skillSlugFromPath(path: string): string | null {
  const match = /^\.flagstage\/skills\/([^/]+)\/SKILL\.md$/.exec(path);
  const slug = match?.[1];
  if (!slug || !isSkillSlug(slug)) return null;
  return slug;
}
