"use client";

import { useRef, useState } from "react";

type Prop = { key: string; value: string };
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

function parseDocument(source: string): { props: Prop[]; blocks: Block[] } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  const props: Prop[] = [];
  let markdown = source;
  if (match) {
    for (const line of (match[1] ?? "").split(/\r?\n/)) {
      const found = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (!found?.[1]) continue;
      props.push({ key: found[1], value: unquote(found[2] ?? "") });
    }
    markdown = match[2] ?? "";
  }
  return { props, blocks: parseBlocks(markdown) };
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

function serialize(props: Prop[], blocks: Block[]): string {
  const front = props
    .map((prop) => {
      const value =
        prop.key === "name" || prop.key === "description"
          ? `"${prop.value.replace(/"/g, "'")}"`
          : prop.value;
      return `${prop.key}: ${value}`;
    })
    .join("\n");
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
  if (!front) return `${body}\n`;
  return `---\n${front}\n---\n\n${body}\n`;
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

const propLabel: Record<string, string> = {
  name: "Name",
  description: "Description"
};

export function SkillDocumentEditor({
  source,
  label,
  readOnly = false
}: {
  source: string;
  label: string;
  readOnly?: boolean;
}) {
  const initial = parseDocument(source);
  const field = useRef<HTMLTextAreaElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [props, setProps] = useState(initial.props);
  const [blocks, setBlocks] = useState(initial.blocks);

  function write(nextProps: Prop[], nextBlocks: Block[]) {
    if (field.current) field.current.value = serialize(nextProps, nextBlocks);
  }

  function readSurface(): { props: Prop[]; blocks: Block[] } | null {
    const root = surface.current;
    if (!root) return null;
    const nextProps = props.map((prop) => {
      const node = root.querySelector(`[data-prop="${prop.key}"]`);
      return { key: prop.key, value: node?.textContent ?? prop.value };
    });
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
    return { props: nextProps, blocks: nextBlocks };
  }

  function onEdit() {
    const current = readSurface();
    if (!current) return;
    const promoted = current.blocks.map(promote);
    const changed = promoted.some((block, index) => block.kind !== current.blocks[index]?.kind);
    write(current.props, promoted);
    if (changed) {
      setProps(current.props);
      setBlocks(promoted);
    }
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-white">
      <div ref={surface} onInput={readOnly ? undefined : onEdit} className="min-w-0">
        {props.length > 0 ? (
          <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 border-b border-[var(--line)] bg-[var(--wash)] px-5 py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
            {props.map((prop) => (
              <PropRow key={prop.key} prop={prop} readOnly={readOnly} />
            ))}
          </div>
        ) : null}
        <div aria-label={label} className="flex flex-col gap-2.5 px-5 py-4">
          {blocks.map((block) => (
            <BlockView key={block.id} block={block} readOnly={readOnly} />
          ))}
        </div>
      </div>
      <textarea
        ref={field}
        name="body"
        defaultValue={source}
        tabIndex={-1}
        aria-hidden
        readOnly
        className="sr-only"
      />
    </div>
  );
}

function PropRow({ prop, readOnly }: { prop: Prop; readOnly: boolean }) {
  const title = propLabel[prop.key] ?? prop.key;
  return (
    <>
      <span className="text-xs font-medium text-muted-foreground" id={`skill-prop-${prop.key}`}>
        {title}
      </span>
      <span
        role="textbox"
        aria-labelledby={`skill-prop-${prop.key}`}
        data-prop={prop.key}
        contentEditable={readOnly ? false : "plaintext-only"}
        suppressContentEditableWarning
        spellCheck={false}
        className="min-w-0 text-sm leading-5 break-words text-foreground outline-none"
      >
        {prop.value}
      </span>
    </>
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
