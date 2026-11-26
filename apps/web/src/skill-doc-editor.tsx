"use client";

import { useRef, useState } from "react";

import { Field } from "@flagstage/ui";

type Block =
  | { id: string; kind: "h1" | "h2" | "h3"; text: string }
  | { id: string; kind: "p"; text: string }
  | { id: string; kind: "ul"; items: string[] };

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

function parseDocument(source: string): { description: string; blocks: Block[] } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  let description = "";
  let markdown = source;
  if (match) {
    const front = match[1] ?? "";
    description = unquote(/^description:\s*(.*)$/m.exec(front)?.[1] ?? "");
    markdown = match[2] ?? "";
  }
  return { description, blocks: parseBlocks(markdown) };
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  let count = 0;
  const id = () => `b${count++}`;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const kind = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      blocks.push({ id: id(), kind, text: heading[2] ?? "" });
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ id: id(), kind: "ul", items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[index] ?? "") &&
      !/^[-*]\s+/.test(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push({ id: id(), kind: "p", text: paragraph.join(" ") });
  }
  return blocks;
}

function serialize(name: string, description: string, blocks: Block[]): string {
  const safeName = name.replace(/"/g, "'").replace(/\s+/g, " ").trim() || "Skill";
  const safeDescription = description.replace(/"/g, "'");
  const body = blocks
    .map((block) => {
      if (block.kind === "ul") return block.items.map((item) => `- ${item}`).join("\n");
      const marks =
        block.kind === "h1"
          ? "# "
          : block.kind === "h2"
            ? "## "
            : block.kind === "h3"
              ? "### "
              : "";
      return `${marks}${block.text}`;
    })
    .join("\n\n");
  return `---\nname: "${safeName}"\ndescription: "${safeDescription}"\n---\n\n${body}\n`;
}

function promote(block: Block): Block {
  if (block.kind !== "p") return block;
  const heading = /^(#{1,3})\s+(.*)$/.exec(block.text);
  if (heading) {
    const level = heading[1]?.length ?? 1;
    const kind = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
    return { id: block.id, kind, text: heading[2] ?? "" };
  }
  if (block.text.startsWith("- ")) {
    return { id: block.id, kind: "ul", items: [block.text.slice(2)] };
  }
  return block;
}

export function SkillDocumentEditor({
  source,
  name,
  label,
  readOnly = false
}: {
  source: string;
  name: string;
  label: string;
  readOnly?: boolean;
}) {
  const initial = parseDocument(source);
  const field = useRef<HTMLTextAreaElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [description, setDescription] = useState(initial.description);
  const [blocks, setBlocks] = useState(initial.blocks);

  function write(nextDescription: string, nextBlocks: Block[]) {
    if (field.current) field.current.value = serialize(name, nextDescription, nextBlocks);
  }

  function readBlocks(): Block[] | null {
    const root = surface.current;
    if (!root) return null;
    const nextBlocks: Block[] = [];
    for (const node of root.querySelectorAll<HTMLElement>("[data-kind]")) {
      const id = node.dataset.block ?? "";
      const kind = node.dataset.kind;
      if (kind === "ul") {
        const items = [...node.querySelectorAll<HTMLElement>("[data-item]")].map(
          (item) => item.textContent ?? ""
        );
        nextBlocks.push({ id, kind: "ul", items });
        continue;
      }
      if (kind === "h1" || kind === "h2" || kind === "h3" || kind === "p") {
        nextBlocks.push({ id, kind, text: node.textContent ?? "" });
      }
    }
    return nextBlocks;
  }

  function onEdit() {
    const current = readBlocks();
    if (!current) return;
    const promoted = current.map(promote);
    const changed = promoted.some((block, index) => block.kind !== current[index]?.kind);
    write(description, promoted);
    if (changed) setBlocks(promoted);
  }

  return (
    <div className="min-w-0 space-y-4">
      <Field
        id="skill-description"
        label="Description"
        value={description}
        readOnly={readOnly}
        autoComplete="off"
        spellCheck={false}
        className="max-sm:text-[13px]"
        onChange={(event) => {
          const next = event.target.value;
          setDescription(next);
          write(next, readBlocks() ?? blocks);
        }}
      />
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-white">
        <div
          ref={surface}
          aria-label={label}
          onInput={readOnly ? undefined : onEdit}
          className="flex min-w-0 flex-col gap-2.5 px-5 py-4"
        >
          {blocks.map((block) => (
            <BlockView key={block.id} block={block} readOnly={readOnly} />
          ))}
        </div>
      </div>
      <textarea
        ref={field}
        name="body"
        defaultValue={serialize(name, initial.description, initial.blocks)}
        tabIndex={-1}
        aria-hidden
        readOnly
        className="sr-only"
      />
    </div>
  );
}

function BlockView({ block, readOnly }: { block: Block; readOnly: boolean }) {
  const editable = readOnly ? false : "plaintext-only";
  if (block.kind === "ul") {
    return (
      <ul data-kind="ul" data-block={block.id} className="flex flex-col gap-1.5">
        {block.items.map((item, index) => (
          <li key={`${block.id}-${index}`} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-[0.6rem] size-1.5 shrink-0 rounded-full bg-[var(--brand-signal)]"
            />
            <span
              role="textbox"
              aria-label="List item"
              data-item
              contentEditable={editable}
              suppressContentEditableWarning
              spellCheck={false}
              className="min-w-0 flex-1 text-[15px] leading-7 break-words outline-none"
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  const Tag = block.kind === "p" ? "p" : block.kind;
  const className =
    block.kind === "h1"
      ? "text-xl font-semibold tracking-tight break-words outline-none"
      : block.kind === "h2"
        ? "pt-2 text-[15px] font-semibold tracking-tight break-words outline-none"
        : block.kind === "h3"
          ? "pt-1 text-sm font-semibold tracking-tight break-words outline-none"
          : "text-[15px] leading-7 break-words outline-none";
  return (
    <Tag
      role="textbox"
      aria-label={block.kind === "p" ? "Paragraph" : "Heading"}
      aria-multiline={block.kind === "p" ? true : undefined}
      data-kind={block.kind}
      data-block={block.id}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck={false}
      className={className}
    >
      {block.text}
    </Tag>
  );
}
