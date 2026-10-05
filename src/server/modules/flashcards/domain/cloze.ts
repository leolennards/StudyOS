import { CLOZE_MAX_NUMBER } from "./limits";

/**
 * Cloze deletions, written the way Anki writes them: `{{c1::answer}}` or
 * `{{c1::answer::hint}}`. Each deletion number becomes one item to review;
 * several deletions may share a number and are then hidden together.
 */
export type ClozePart =
  { kind: "text"; text: string } | { kind: "cloze"; number: number; answer: string; hint: string | null };

const CLOZE_RE = /\{\{c(\d{1,3})::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** Splits cloze text into plain text and deletions, in order. */
export function parseCloze(text: string): ClozePart[] {
  const parts: ClozePart[] = [];
  let last = 0;
  for (const m of text.matchAll(CLOZE_RE)) {
    const number = Number(m[1]);
    const answer = m[2] ?? "";
    // A deletion with no answer, or a number outside the range, stays as typed.
    if (number < 1 || number > CLOZE_MAX_NUMBER || answer.trim() === "") continue;
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    const hint = m[3]?.trim();
    parts.push({ kind: "cloze", number, answer, hint: hint ? hint : null });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/** The distinct deletion numbers in a cloze text, ascending. */
export function clozeNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const p of parseCloze(text)) if (p.kind === "cloze") numbers.add(p.number);
  return [...numbers].sort((a, b) => a - b);
}

/**
 * One side of a cloze item. On the question side the deletions numbered
 * `number` are hidden (showing the hint if there is one) and every other
 * deletion shows its answer; on the answer side the hidden ones are revealed
 * and marked, so the student can see what was asked.
 */
export type ClozeSegment = { text: string; mark: "none" | "blank" | "answer" };

export function renderCloze(text: string, number: number, side: "question" | "answer"): ClozeSegment[] {
  const segments: ClozeSegment[] = [];
  for (const p of parseCloze(text)) {
    if (p.kind === "text") segments.push({ text: p.text, mark: "none" });
    else if (p.number !== number) segments.push({ text: p.answer, mark: "none" });
    else if (side === "question") segments.push({ text: p.hint ?? "…", mark: "blank" });
    else segments.push({ text: p.answer, mark: "answer" });
  }
  return segments;
}

/** The text with every deletion shown as its answer, for lists and search results. */
export function clozePlainText(text: string): string {
  return parseCloze(text)
    .map((p) => (p.kind === "text" ? p.text : p.answer))
    .join("");
}
