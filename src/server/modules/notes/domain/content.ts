import { NOTE_MAX_DEPTH } from "./limits";

/**
 * A note's content: the editor's JSON document (ProseMirror format), which is
 * the source of truth (Architecture §3, notes storage rule). Pure functions
 * only, so they run the same in the browser, the server and the tests.
 */
export type NoteMark = { type: string; attrs?: Record<string, unknown> };
export type NoteNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoteNode[];
  marks?: NoteMark[];
  text?: string;
};

/** The block and inline types the editor can show. Anything else is refused on save. */
export const NOTE_NODE_TYPES = [
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "inlineMath",
  "blockMath",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
] as const;

export const NOTE_MARK_TYPES = ["bold", "italic", "underline", "strike", "code", "link", "highlight"] as const;

const nodeTypes = new Set<string>(NOTE_NODE_TYPES);
const markTypes = new Set<string>(NOTE_MARK_TYPES);

export const emptyNoteContent = (): NoteNode => ({ type: "doc", content: [{ type: "paragraph" }] });

/**
 * Checks a document from the browser before it is stored: the right shape,
 * only known node and mark types, not nested too deeply, and links only to
 * web or email addresses. Returns an error message, or null when it is fine.
 */
export function validateNoteContent(value: unknown): string | null {
  if (!isRecord(value) || value.type !== "doc") return "The note's content isn't valid.";
  return validateNode(value, 0);
}

function validateNode(node: unknown, depth: number): string | null {
  if (depth > NOTE_MAX_DEPTH) return "This note is nested too deeply to save.";
  if (!isRecord(node) || typeof node.type !== "string") return "The note's content isn't valid.";
  if (!nodeTypes.has(node.type)) return "The note contains a kind of block StudyOS doesn't support.";
  if (node.attrs !== undefined && !isRecord(node.attrs)) return "The note's content isn't valid.";
  if (node.text !== undefined && (typeof node.text !== "string" || node.type !== "text")) {
    return "The note's content isn't valid.";
  }
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) return "The note's content isn't valid.";
    for (const mark of node.marks) {
      if (!isRecord(mark) || typeof mark.type !== "string" || !markTypes.has(mark.type)) {
        return "The note contains formatting StudyOS doesn't support.";
      }
      if (mark.attrs !== undefined && !isRecord(mark.attrs)) return "The note's content isn't valid.";
      if (mark.type === "link" && !isSafeHref(mark.attrs?.href)) return "The note contains a link that isn't allowed.";
    }
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) return "The note's content isn't valid.";
    for (const child of node.content) {
      const error = validateNode(child, depth + 1);
      if (error) return error;
    }
  }
  return null;
}

/** Links may point at web pages and email addresses only, never `javascript:` or `data:`. */
export function isSafeHref(href: unknown): boolean {
  if (typeof href !== "string" || href.length > 2048) return false;
  return /^(https?:\/\/|mailto:)/i.test(href.trim());
}

const BLOCKS_WITH_BREAK_AFTER = new Set([
  "paragraph",
  "heading",
  "codeBlock",
  "blockMath",
  "tableRow",
  "horizontalRule",
]);

/**
 * The plain text of a note, one block per line, for search and word counts.
 * Maths is kept as its LaTeX source so it can be found.
 */
export function noteContentToText(doc: NoteNode): string {
  const out: string[] = [];
  const walk = (node: NoteNode) => {
    switch (node.type) {
      case "text":
        out.push(node.text ?? "");
        return;
      case "hardBreak":
        out.push("\n");
        return;
      case "inlineMath":
        out.push(String(node.attrs?.latex ?? ""));
        return;
      case "blockMath":
        out.push(String(node.attrs?.latex ?? ""), "\n");
        return;
      case "tableCell":
      case "tableHeader":
        // A cell's paragraphs stay on its row's line.
        out.push(noteContentToText({ type: "doc", content: node.content }).replace(/\n/g, " "), "\t");
        return;
    }
    node.content?.forEach(walk);
    if (BLOCKS_WITH_BREAK_AFTER.has(node.type)) out.push("\n");
  };
  walk(doc);
  return out
    .join("")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, lines) => line !== "" || (i > 0 && lines[i - 1] !== ""))
    .join("\n")
    .trim();
}

export function countWords(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)?.length ?? 0;
}

/** The first lines of a note, for previews in lists. */
export function excerpt(text: string, max = 180) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export const displayTitle = (title: string) => title.trim() || "Untitled note";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
