"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type RefObject
} from "react";

import {
  parseSkillDocument,
  withAppendedText,
  withBlockText,
  withListItemText,
  withSkillDescription,
  type SkillBlock
} from "@flagstage/core/skill-document";
import { Field } from "@flagstage/ui";

type Caret = { id: string; itemIndex: number | null; offset: number };

function shape(blocks: SkillBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === "list") return `list:${block.items.length}`;
      if (block.kind === "heading") return `h${block.level}`;
      return block.kind;
    })
    .join("|");
}

function readEditable(node: HTMLElement): string {
  const pieces: string[] = [];
  const walk = (current: Node) => {
    current.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        pieces.push((child.textContent ?? "").replace(/\u00a0/g, " "));
        return;
      }
      if (!(child instanceof HTMLElement)) return;
      if (child.tagName === "BR") {
        pieces.push("\n");
        return;
      }
      if (child.tagName === "DIV" || child.tagName === "P") {
        if (pieces.length > 0 && !pieces[pieces.length - 1]?.endsWith("\n")) pieces.push("\n");
      }
      walk(child);
    });
  };
  walk(node);
  return pieces.join("");
}

function caretOffset(node: HTMLElement): number {
  const selection = window.getSelection();
  const focus = selection?.focusNode;
  if (!selection || selection.rangeCount === 0 || !focus || !node.contains(focus)) {
    return readEditable(node).length;
  }
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(node);
  range.setEnd(focus, selection.focusOffset);
  return range.toString().length;
}

function placeCaret(element: HTMLElement, offset: number) {
  element.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const node = [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
  if (node) {
    range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
    range.collapse(true);
  } else {
    range.selectNodeContents(element);
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretAfter(source: string, blockId: string, typed: string, cursor: number): Caret {
  const block = parseSkillDocument(source).blocks.find((item) => item.id === blockId);
  if (!block || block.kind === "blank") return { id: blockId, itemIndex: null, offset: cursor };
  if (block.kind === "heading") {
    const marker = Math.max(0, typed.length - block.text.length);
    return {
      id: block.id,
      itemIndex: null,
      offset: Math.max(0, Math.min(block.text.length, cursor - marker))
    };
  }
  if (block.kind === "list") {
    let remaining = cursor;
    for (const [index, item] of block.items.entries()) {
      if (remaining <= item.text.length || index === block.items.length - 1) {
        return {
          id: block.id,
          itemIndex: index,
          offset: Math.max(0, Math.min(item.text.length, remaining))
        };
      }
      remaining -= item.text.length + 1;
    }
  }
  const length = "text" in block ? block.text.length : cursor;
  return { id: block.id, itemIndex: null, offset: Math.max(0, Math.min(length, cursor)) };
}

const focusRing =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2";

export function SkillDocumentEditor({
  source,
  label,
  readOnly = false
}: {
  source: string;
  label: string;
  readOnly?: boolean;
}) {
  const initial = parseSkillDocument(source);
  const field = useRef<HTMLTextAreaElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const sourceRef = useRef(source);

  function publish(next: string) {
    sourceRef.current = next;
    if (field.current) field.current.value = next;
  }

  return (
    <div className="min-w-0 space-y-4">
      <DescriptionField
        initial={initial.description}
        readOnly={readOnly}
        sourceRef={sourceRef}
        publish={publish}
      />
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-white">
        <DocumentSurface
          initialBlocks={initial.blocks}
          label={label}
          readOnly={readOnly}
          surface={surface}
          field={field}
          sourceRef={sourceRef}
          publish={publish}
        />
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

function DescriptionField({
  initial,
  readOnly,
  sourceRef,
  publish
}: {
  initial: string;
  readOnly: boolean;
  sourceRef: MutableRefObject<string>;
  publish: (next: string) => void;
}) {
  return (
    <Field
      id="skill-description"
      label="Description"
      defaultValue={initial}
      readOnly={readOnly}
      autoComplete="off"
      spellCheck={false}
      className="max-sm:text-[13px]"
      onInput={(event) => {
        publish(withSkillDescription(sourceRef.current, event.currentTarget.value));
      }}
    />
  );
}

function DocumentSurface({
  initialBlocks,
  label,
  readOnly,
  surface,
  field,
  sourceRef,
  publish
}: {
  initialBlocks: SkillBlock[];
  label: string;
  readOnly: boolean;
  surface: RefObject<HTMLDivElement | null>;
  field: RefObject<HTMLTextAreaElement | null>;
  sourceRef: MutableRefObject<string>;
  publish: (next: string) => void;
}) {
  const [blocks, setBlocks] = useState(initialBlocks);
  const shapeRef = useRef(shape(initialBlocks));
  const pending = useRef<Caret | null>(null);
  const draft = useRef("");

  useLayoutEffect(() => {
    const root = surface.current;
    if (!root) return;
    const caret = pending.current;
    pending.current = null;
    const append = root.querySelector<HTMLElement>('[data-block="append"]');
    if (append && caret?.id !== "append") append.textContent = "";
    if (!caret) return;
    const host =
      caret.itemIndex == null
        ? root.querySelector<HTMLElement>(`[data-block="${CSS.escape(caret.id)}"]`)
        : root.querySelector<HTMLElement>(
            `[data-block="${CSS.escape(caret.id)}"] [data-index="${caret.itemIndex}"]`
          );
    if (!host || host === append) return;
    placeCaret(host, caret.offset);
  }, [blocks, surface]);

  function commit(next: string, typed: string, blockId: string, cursor: number) {
    if (next === sourceRef.current) return;
    publish(next);
    const nextShape = shape(parseSkillDocument(next).blocks);
    if (nextShape === shapeRef.current) return;
    shapeRef.current = nextShape;
    pending.current = caretAfter(next, blockId, typed, cursor);
    setBlocks(parseSkillDocument(next).blocks);
  }

  function onBlock(event: FormEvent<HTMLElement>) {
    if (readOnly) return;
    const node = event.currentTarget;
    const text = readEditable(node);
    const cursor = caretOffset(node);
    if (node.dataset.block === "append") {
      if (!text) return;
      const base =
        draft.current && sourceRef.current.endsWith(draft.current)
          ? sourceRef.current.slice(0, -draft.current.length)
          : sourceRef.current;
      const next = withAppendedText(base, text);
      const addition = next.slice(base.length);
      const promoted = shape(parseSkillDocument(next).blocks) !== shapeRef.current;
      draft.current = promoted ? "" : addition;
      commit(next, text, parseSkillDocument(next).blocks.at(-1)?.id ?? "append", text.length);
      return;
    }
    const blockId = node.dataset.block ?? "";
    if (node.dataset.item != null) {
      commit(
        withListItemText(sourceRef.current, blockId, Number(node.dataset.index ?? "-1"), text),
        text,
        blockId,
        cursor
      );
      return;
    }
    commit(withBlockText(sourceRef.current, blockId, text), text, blockId, cursor);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (readOnly || event.key !== "Enter" || event.shiftKey) return;
    const node = event.currentTarget;
    if (node.dataset.block === "append" || node.dataset.item != null) return;
    const root = surface.current;
    const blockId = node.dataset.block;
    if (!root || !blockId) return;
    const last = [...root.querySelectorAll<HTMLElement>("[data-kind]")]
      .filter((item) => item.dataset.item == null)
      .at(-1);
    if (last?.dataset.block !== blockId) return;
    event.preventDefault();
    root.querySelector<HTMLElement>('[data-block="append"]')?.focus();
  }

  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const sync = () => {
      const root = surface.current;
      if (!root || readOnly) {
        if (field.current) field.current.value = sourceRef.current;
        return;
      }
      const edits: Array<{ id: string; index: number | null; text: string }> = [];
      root.querySelectorAll<HTMLElement>("[data-block]").forEach((node) => {
        const id = node.dataset.block ?? "";
        if (id === "append") return;
        if (node.dataset.kind === "list") {
          node.querySelectorAll<HTMLElement>("[data-item]").forEach((item) => {
            edits.push({
              id,
              index: Number(item.dataset.index ?? "-1"),
              text: readEditable(item)
            });
          });
          return;
        }
        if (node.dataset.item != null) return;
        edits.push({ id, index: null, text: readEditable(node) });
      });
      const descriptionInput = document.getElementById("skill-description");
      let next = sourceRef.current;
      if (descriptionInput instanceof HTMLInputElement) {
        next = withSkillDescription(next, descriptionInput.value);
      }
      for (const edit of edits.reverse()) {
        next =
          edit.index == null
            ? withBlockText(next, edit.id, edit.text)
            : withListItemText(next, edit.id, edit.index, edit.text);
      }
      const append = root.querySelector<HTMLElement>('[data-block="append"]');
      const extra = append ? readEditable(append) : "";
      if (extra) next = withAppendedText(next, extra);
      publish(next);
    };
    form.addEventListener("submit", sync);
    return () => form.removeEventListener("submit", sync);
  }, [field, publish, readOnly, sourceRef, surface]);

  const visible = blocks.filter((block) => block.kind !== "blank");
  const editable = readOnly ? false : "plaintext-only";

  return (
    <div ref={surface} aria-label={label} className="flex min-w-0 flex-col gap-2.5 px-5 py-4">
      {visible.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          editable={editable}
          onInput={onBlock}
          onKeyDown={onKeyDown}
        />
      ))}
      {readOnly ? null : (
        <div
          role="textbox"
          aria-label="Paragraph"
          aria-multiline="true"
          data-block="append"
          contentEditable={editable}
          tabIndex={0}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={onBlock}
          onKeyDown={onKeyDown}
          className={`min-h-7 text-[15px] leading-7 break-words whitespace-pre-wrap ${focusRing}`}
        />
      )}
    </div>
  );
}

function BlockView({
  block,
  editable,
  onInput,
  onKeyDown
}: {
  block: SkillBlock;
  editable: false | "plaintext-only";
  onInput: (event: FormEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  if (block.kind === "blank") return null;
  if (block.kind === "list") {
    return (
      <ul data-kind="list" data-block={block.id} className="flex flex-col gap-1.5">
        {block.items.map((item, index) => (
          <li
            key={`${block.id}-${index}`}
            className="flex items-start gap-2.5"
            style={item.depth > 0 ? { paddingLeft: `${item.depth * 1.25}rem` } : undefined}
          >
            <span
              aria-hidden
              className="mt-[0.6rem] size-1.5 shrink-0 rounded-full bg-[var(--brand-signal)]"
            />
            <span
              role="textbox"
              aria-label="List item"
              aria-multiline="true"
              data-item
              data-index={index}
              data-block={block.id}
              contentEditable={editable}
              tabIndex={editable ? 0 : -1}
              suppressContentEditableWarning
              spellCheck={false}
              onInput={onInput}
              onKeyDown={onKeyDown}
              className={`min-h-7 min-w-0 flex-1 text-[15px] leading-7 break-words whitespace-pre-wrap ${focusRing}`}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  const className =
    block.kind === "heading" && block.level === 1
      ? "text-xl font-semibold tracking-tight break-words whitespace-pre-wrap"
      : block.kind === "heading" && block.level === 2
        ? "pt-2 text-[15px] font-semibold tracking-tight break-words whitespace-pre-wrap"
        : block.kind === "heading"
          ? "pt-1 text-sm font-semibold tracking-tight break-words whitespace-pre-wrap"
          : "min-h-7 font-sans text-[15px] leading-7 break-words whitespace-pre-wrap";
  return (
    <div
      role="textbox"
      aria-label={block.kind === "heading" ? "Heading" : "Paragraph"}
      aria-multiline="true"
      data-kind={block.kind}
      data-block={block.id}
      contentEditable={editable}
      tabIndex={editable ? 0 : -1}
      suppressHydrationWarning
      suppressContentEditableWarning
      spellCheck={false}
      onInput={onInput}
      onKeyDown={onKeyDown}
      className={`${className} ${focusRing}`}
    >
      {block.text}
    </div>
  );
}
