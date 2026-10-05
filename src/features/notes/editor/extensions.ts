import type { AnyExtension } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";
import { isSafeHref } from "@/server/modules/notes/domain/content";

export type MathKind = "inline" | "block";
export type MathTarget = { kind: MathKind; latex: string; pos: number | null };

export type NoteExtensionOptions = {
  /** Opens the maths editor for a formula that was clicked. */
  onEditMath?: (target: MathTarget) => void;
  /** Extra extensions, such as the slash menu, that need the browser. */
  extra?: AnyExtension[];
};

/**
 * The note editor's blocks and formatting (ADR-010). Every node and mark
 * here must also be listed in the notes module's NOTE_NODE_TYPES and
 * NOTE_MARK_TYPES, or the server will refuse to save it; a unit test checks
 * that they agree.
 */
export function noteExtensions({ onEditMath, extra = [] }: NoteExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && isSafeHref(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    TableKit.configure({ table: { resizable: false } }),
    Mathematics.configure({
      katexOptions: { throwOnError: false },
      inlineOptions: {
        onClick: (node, pos) => onEditMath?.({ kind: "inline", latex: String(node.attrs.latex ?? ""), pos }),
      },
      blockOptions: {
        onClick: (node, pos) => onEditMath?.({ kind: "block", latex: String(node.attrs.latex ?? ""), pos }),
      },
    }),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "heading" ? "Heading" : "Write something, or type “/” for headings, lists, maths and more",
    }),
    ...extra,
  ];
}
