"use client";

import { useEffect, useRef } from "react";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { skillEditAnchor } from "./skill-source";

const ink = "oklch(0.22 0.02 265)";
const indigo = "oklch(0.4 0.09 265)";
const teal = "oklch(0.46 0.08 195)";

const skillHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: "oklch(0.34 0.09 265)", fontWeight: "600" },
  { tag: tags.heading2, color: "oklch(0.38 0.08 265)", fontWeight: "600" },
  { tag: tags.heading3, color: "oklch(0.4 0.07 265)", fontWeight: "600" },
  { tag: tags.processingInstruction, color: teal },
  { tag: tags.propertyName, color: indigo },
  { tag: tags.string, color: "oklch(0.4 0.045 200)" },
  { tag: tags.meta, color: "oklch(0.72 0.015 265)" },
  { tag: tags.separator, color: "oklch(0.62 0.02 265)" }
]);

const skillTheme = EditorView.theme(
  {
    "&": {
      color: ink,
      backgroundColor: "transparent",
      fontSize: "13px"
    },
    "&.cm-focused": {
      outline: "none"
    },
    ".cm-scroller": {
      fontFamily: 'var(--font-flagstage-mono), "IBM Plex Mono", ui-monospace, monospace',
      lineHeight: "1.65",
      overflowX: "hidden"
    },
    ".cm-content": {
      padding: "8px 0 12px",
      caretColor: indigo
    },
    ".cm-line": {
      padding: "0 14px 0 6px"
    },
    ".cm-gutters": {
      backgroundColor: "#f6f5fb",
      color: "oklch(0.62 0.018 265)",
      border: "none",
      borderRight: "1px solid #e6e4ee"
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 12px 0 14px",
      minWidth: "2.4rem"
    },
    ".cm-activeLine": {
      backgroundColor: "#ece9f8"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#e6e2f6",
      color: "oklch(0.42 0.06 265)"
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: indigo,
      borderLeftWidth: "1.5px"
    },
    ".cm-cursorLayer": {
      animation: "none"
    }
  },
  { dark: false }
);

export function SkillCodeEditor({
  source,
  label,
  readOnly = false
}: {
  source: string;
  label: string;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const parent = host.current;
    const hidden = field.current;
    if (!parent || !hidden) return;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        selection: { anchor: skillEditAnchor(source) },
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          yamlFrontmatter({ content: markdown({ addKeymap: true, completeHTMLTags: false }) }),
          syntaxHighlighting(skillHighlight),
          skillTheme,
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({
            "aria-label": label,
            spellcheck: "false"
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) hidden.value = update.state.doc.toString();
          })
        ]
      })
    });
    if (!readOnly) view.contentDOM.focus({ preventScroll: true });
    return () => view.destroy();
  }, [label, readOnly, source]);

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-white">
      <div ref={host} />
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
