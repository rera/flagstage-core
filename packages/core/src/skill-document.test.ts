import { describe, expect, it } from "vitest";

import {
  parseSkillDocument,
  parseSkillMarkdown,
  serializeSkillDocument,
  skillFileBytes,
  skillPartsFromSource,
  skillSourceFromParts,
  withAppendedText,
  withBlockText,
  withListItemText,
  withSkillDescription,
  withSkillName,
  writeSkillMarkdown
} from "./index";

const rich = [
  "---",
  "name: Event facts",
  'description: "Dates, course, and other facts."',
  'globs: "**/*"',
  "alwaysApply: true",
  "notes:",
  "  owner: site",
  "---",
  "",
  "# Event facts",
  "",
  "Use these facts when a page mentions the event.",
  "Do not invent a date, a course, or a winner.",
  "",
  "## This championship",
  "",
  "- Event: PGA Championship",
  "- Site: pgachampionship.com",
  "",
  "### Leave out",
  "",
  "- Do not guess a tee time.",
  "  - Do not guess a hole.",
  "    - Do not guess a yardage.",
  "- Do not name a player unless the page is a player page.",
  "",
  "* Star list",
  "  * Nested star",
  "",
  "",
  "Keep each sponsor line with the sponsor.",
  "",
  "```",
  "form",
  "",
  "```",
  ""
].join("\n");

function block(source: string, kind: string, text: string) {
  const found = parseSkillDocument(source).blocks.find(
    (item) => item.kind === kind && ("text" in item ? item.text.startsWith(text) : false)
  );
  if (!found) throw new Error(`No ${kind} starting with ${text}`);
  return found;
}

describe("skill document round trip", () => {
  it("keeps headings, nested lists, plain lists, paragraphs, blank lines, and unknown keys", () => {
    const doc = parseSkillDocument(rich);
    expect(serializeSkillDocument(doc)).toBe(rich);
    expect(doc.description).toBe("Dates, course, and other facts.");
    expect(doc.blocks.filter((item) => item.kind === "heading").map((item) => item.text)).toEqual([
      "Event facts",
      "This championship",
      "Leave out"
    ]);
    const nested = doc.blocks.find((item) => item.kind === "list" && item.items.length === 4);
    expect(
      nested && nested.kind === "list" ? nested.items.map((item) => [item.depth, item.text]) : []
    ).toEqual([
      [0, "Do not guess a tee time."],
      [1, "Do not guess a hole."],
      [2, "Do not guess a yardage."],
      [0, "Do not name a player unless the page is a player page."]
    ]);
    const stars = doc.blocks.find((item) => item.kind === "list" && item.items[0]?.marker === "*");
    expect(stars && stars.kind === "list" ? stars.items.map((item) => item.text) : []).toEqual([
      "Star list",
      "Nested star"
    ]);
    expect(doc.blocks.filter((item) => item.kind === "blank").map((item) => item.raw)).toContain(
      "\n\n"
    );
    expect(rich).toContain('globs: "**/*"');
    expect(rich).toContain("alwaysApply: true");
    expect(rich).toContain("  owner: site");
  });

  it("round-trips windows newlines, a missing body, and a file with no front matter", () => {
    const crlf =
      '---\r\nname: Notes\r\ndescription: "Keep it"\r\nextra: 1\r\n---\r\n\r\n# Title\r\n\r\n- One\r\n  - Two\r\n';
    expect(serializeSkillDocument(parseSkillDocument(crlf))).toBe(crlf);
    expect(serializeSkillDocument(parseSkillDocument("---\nname: Only\n---"))).toBe(
      "---\nname: Only\n---"
    );
    const prose = "Just a paragraph.\n\n- And a list\n";
    expect(serializeSkillDocument(parseSkillDocument(prose))).toBe(prose);
    expect(serializeSkillDocument(parseSkillDocument(""))).toBe("");
  });

  it("changes the description without rewriting the rest of the file", () => {
    const next = withSkillDescription(rich, "Dates and the course.");
    expect(next).not.toBe(rich);
    expect(next).toContain('description: "Dates and the course."');
    expect(next).toContain('globs: "**/*"');
    expect(next).toContain("alwaysApply: true");
    expect(next).toContain("  owner: site");
    expect(next).toContain("    - Do not guess a yardage.");
    expect(next).toContain("\n\nKeep each sponsor line with the sponsor.");
    expect(withSkillDescription(next, "Dates and the course.")).toBe(next);
    expect(withSkillDescription(rich, "Dates, course, and other facts.")).toBe(rich);
  });

  it("writes the existing name and leaves a matching name untouched", () => {
    const quoted = rich.replace("name: Event facts", 'name: "Event facts"');
    expect(withSkillName(quoted, "Event facts")).toBe(quoted);
    expect(withSkillName(rich, "Event facts")).toBe(rich);
    const renamed = withSkillName(rich, "Championship facts");
    expect(renamed).toContain("name: Championship facts");
    expect(renamed).toContain('globs: "**/*"');
    expect(renamed).toContain("    - Do not guess a yardage.");
    expect(serializeSkillDocument(parseSkillDocument(renamed))).toBe(renamed);
  });

  it("edits one paragraph and one nested item without dropping surrounding markdown", () => {
    const paragraph = block(rich, "paragraph", "Use these facts");
    const edited = withBlockText(
      rich,
      paragraph.id,
      "Use these facts when a page mentions the event.\nName the course the first time."
    );
    expect(edited).toContain("Name the course the first time.");
    expect(edited).toContain('globs: "**/*"');
    expect(edited).toContain("# Event facts");
    expect(edited).toContain("    - Do not guess a yardage.");
    expect(edited).toContain("\n\nKeep each sponsor line with the sponsor.");
    expect(
      withBlockText(edited, paragraph.id, paragraph.kind === "paragraph" ? paragraph.text : "")
    ).toBe(rich);
    expect(serializeSkillDocument(parseSkillDocument(edited))).toBe(edited);

    const list = parseSkillDocument(rich).blocks.find(
      (item) =>
        item.kind === "list" && item.items.some((entry) => entry.text === "Do not guess a hole.")
    );
    if (!list || list.kind !== "list") throw new Error("missing nested list");
    const index = list.items.findIndex((entry) => entry.text === "Do not guess a hole.");
    const nested = withListItemText(rich, list.id, index, "Do not guess a pin position.");
    expect(nested).toContain("  - Do not guess a pin position.");
    expect(nested).toContain("    - Do not guess a yardage.");
    expect(nested).toContain("- Do not guess a tee time.");
    expect(nested).toContain('description: "Dates, course, and other facts."');
    expect(withListItemText(nested, list.id, index, "Do not guess a hole.")).toBe(rich);
  });

  it("turns a typed heading or list into that block and keeps the front matter", () => {
    const source = '---\nname: Skill\ndescription: "Desc"\nextra: keep\n---\n\nHello\n';
    const paragraph = block(source, "paragraph", "Hello");
    const headed = withBlockText(source, paragraph.id, "# Hello");
    const heading = parseSkillDocument(headed).blocks.find((item) => item.kind === "heading");
    expect(heading && heading.kind === "heading" ? [heading.level, heading.text] : []).toEqual([
      1,
      "Hello"
    ]);
    expect(headed).toContain("extra: keep");
    expect(serializeSkillDocument(parseSkillDocument(headed))).toBe(headed);

    const listed = withBlockText(source, paragraph.id, "- Parent\n  - Child");
    const list = parseSkillDocument(listed).blocks.find((item) => item.kind === "list");
    expect(
      list && list.kind === "list"
        ? list.items.map((item) => [item.depth, item.text, item.marker])
        : []
    ).toEqual([
      [0, "Parent", "-"],
      [1, "Child", "-"]
    ]);
    expect(listed).toContain('description: "Desc"');
  });

  it("saves an unchanged file as the same bytes", () => {
    const original = new TextEncoder().encode(rich);
    expect(skillFileBytes(original, rich, "Event facts")).toBe(original);
    expect(skillFileBytes(original, rich.replace(/\n/g, "\r\n"), "Event facts")).toBe(original);
    const described = withSkillDescription(rich, "Dates and the course.");
    const bytes = skillFileBytes(original, described, "Event facts");
    expect(bytes).not.toBe(original);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text).toBe(described);
    expect(text).toContain("  owner: site");
  });

  it("round-trips an account skill body and description", () => {
    const skill = {
      name: "Brand voice",
      description: 'How the account sounds, including "championship".',
      body: "Use short sentences.\n\n- Headlines name the event.\n  - No exclamation mark.\n\n\nKeep the dates together.\n"
    };
    const source = skillSourceFromParts(skill);
    expect(withSkillName(source, skill.name)).toBe(source);
    expect(skillPartsFromSource(source, skill.name)).toEqual(skill);
    expect(serializeSkillDocument(parseSkillDocument(source))).toBe(source);

    const paragraph = block(source, "paragraph", "Use short sentences.");
    const edited = withBlockText(source, paragraph.id, "Use short, calm sentences.");
    expect(skillPartsFromSource(edited, skill.name).body).toBe(
      "Use short, calm sentences.\n\n- Headlines name the event.\n  - No exclamation mark.\n\n\nKeep the dates together.\n"
    );
    expect(skillPartsFromSource(edited, skill.name).description).toBe(skill.description);

    const described = withSkillDescription(source, "Calm and specific.");
    expect(skillPartsFromSource(described, skill.name)).toEqual({
      ...skill,
      description: "Calm and specific."
    });
    expect(described).toContain("name: Brand voice");
  });

  it("matches today's writer for a plain skill and does not trim an edited body", () => {
    const skill = {
      name: "Event facts",
      description: "Dates, course, and other facts for this championship.",
      body: "Event: PGA Championship\n\nUse these facts.\n"
    };
    const written = writeSkillMarkdown({ ...skill, body: skill.body.replace(/\s+$/, "") });
    expect(parseSkillMarkdown(written, skill.name)).toEqual({
      name: skill.name,
      description: skill.description,
      body: "Event: PGA Championship\n\nUse these facts."
    });
    expect(serializeSkillDocument(parseSkillDocument(written))).toBe(written);
    const appended = withAppendedText('---\nname: Skill\ndescription: ""\n---\n\n', "Hello");
    expect(appended.endsWith("Hello\n")).toBe(true);
    expect(serializeSkillDocument(parseSkillDocument(appended))).toBe(appended);
  });
});
