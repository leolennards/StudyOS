import { clozeNumbers, clozePlainText, renderCloze, type ClozeSegment } from "./cloze";

export type CardType = "basic" | "reverse" | "cloze";

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  basic: "Basic",
  reverse: "Basic and reversed",
  cloze: "Cloze",
};

/**
 * The reviewable items a card produces, as ordinals: a basic card has one
 * (0); a reversed card two (0 front→back, 1 back→front); a cloze card one
 * per deletion number.
 */
export function cardOrdinals(card: { type: CardType; front: string }): number[] {
  if (card.type === "basic") return [0];
  if (card.type === "reverse") return [0, 1];
  return clozeNumbers(card.front);
}

/** What the student sees for one item: the prompt, and what is revealed with the answer. */
export type ItemFaces =
  | { kind: "plain"; question: string; answer: string }
  | { kind: "cloze"; question: ClozeSegment[]; answer: ClozeSegment[]; extra: string };

export function itemFaces(card: { type: CardType; front: string; back: string }, ordinal: number): ItemFaces {
  if (card.type === "cloze") {
    return {
      kind: "cloze",
      question: renderCloze(card.front, ordinal, "question"),
      answer: renderCloze(card.front, ordinal, "answer"),
      extra: card.back,
    };
  }
  if (card.type === "reverse" && ordinal === 1) return { kind: "plain", question: card.back, answer: card.front };
  return { kind: "plain", question: card.front, answer: card.back };
}

/** A short label for an item, shown in lists: "Front → back", "Back → front", "c2". */
export function itemLabel(type: CardType, ordinal: number): string {
  if (type === "cloze") return `c${ordinal}`;
  if (type === "reverse") return ordinal === 0 ? "Front → back" : "Back → front";
  return "Card";
}

/** The card's text as one line for lists and search: deletions shown as their answers. */
export function cardPreview(card: { type: CardType; front: string }): string {
  const text = card.type === "cloze" ? clozePlainText(card.front) : card.front;
  return text.replace(/\s+/g, " ").trim();
}

/** Why a card can't be saved as written, or null when it can. */
export function cardProblem(card: { type: CardType; front: string; back: string }): string | null {
  if (card.front.trim() === "")
    return card.type === "cloze" ? "Write the text with its deletions." : "Write the front of the card.";
  if (card.type === "cloze") {
    if (clozeNumbers(card.front).length === 0) {
      return "Add at least one deletion, written like {{c1::answer}}.";
    }
    return null;
  }
  if (card.back.trim() === "") return "Write the back of the card.";
  return null;
}
