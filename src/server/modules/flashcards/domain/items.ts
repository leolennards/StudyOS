import { clozeNumbers, clozePlainText, renderCloze, type ClozeSegment } from "./cloze";
import { boxNumbers, occlusionProblem, type OcclusionBox } from "./occlusion";

export type CardType = "basic" | "reverse" | "cloze" | "image_occlusion";

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  basic: "Basic",
  reverse: "Basic and reversed",
  cloze: "Cloze",
  image_occlusion: "Image occlusion",
};

/**
 * A card's content as the rules below need it. Pictures are referred to by
 * id; an image occlusion card has its picture on the front and its boxes in
 * `occlusions`.
 */
export type CardContent = {
  type: CardType;
  front: string;
  back: string;
  frontImageId?: string | null;
  backImageId?: string | null;
  occlusions?: OcclusionBox[] | null;
};

/**
 * The reviewable items a card produces, as ordinals: a basic card has one
 * (0); a reversed card two (0 front→back, 1 back→front); a cloze card one
 * per deletion number; an image occlusion card one per box.
 */
export function cardOrdinals(card: Pick<CardContent, "type" | "front" | "occlusions">): number[] {
  if (card.type === "basic") return [0];
  if (card.type === "reverse") return [0, 1];
  if (card.type === "image_occlusion") return boxNumbers(card.occlusions ?? []);
  return clozeNumbers(card.front);
}

/** What the student sees for one item: the prompt, and what is revealed with the answer. */
export type ItemFaces =
  | {
      kind: "plain";
      question: string;
      answer: string;
      questionImageId: string | null;
      answerImageId: string | null;
    }
  | {
      kind: "cloze";
      question: ClozeSegment[];
      answer: ClozeSegment[];
      extra: string;
      imageId: string | null;
      extraImageId: string | null;
    }
  | {
      kind: "occlusion";
      prompt: string;
      imageId: string;
      boxes: OcclusionBox[];
      /** The box being asked: hidden and marked on the question, uncovered on the answer. */
      target: number;
      extra: string;
    };

export function itemFaces(card: CardContent, ordinal: number): ItemFaces {
  const frontImageId = card.frontImageId ?? null;
  const backImageId = card.backImageId ?? null;
  if (card.type === "image_occlusion") {
    return {
      kind: "occlusion",
      prompt: card.front,
      imageId: frontImageId ?? "",
      boxes: card.occlusions ?? [],
      target: ordinal,
      extra: card.back,
    };
  }
  if (card.type === "cloze") {
    return {
      kind: "cloze",
      question: renderCloze(card.front, ordinal, "question"),
      answer: renderCloze(card.front, ordinal, "answer"),
      extra: card.back,
      imageId: frontImageId,
      extraImageId: backImageId,
    };
  }
  if (card.type === "reverse" && ordinal === 1) {
    return {
      kind: "plain",
      question: card.back,
      answer: card.front,
      questionImageId: backImageId,
      answerImageId: frontImageId,
    };
  }
  return {
    kind: "plain",
    question: card.front,
    answer: card.back,
    questionImageId: frontImageId,
    answerImageId: backImageId,
  };
}

/** A short label for an item, shown in lists: "Front → back", "Back → front", "c2", "Box 3". */
export function itemLabel(type: CardType, ordinal: number): string {
  if (type === "cloze") return `c${ordinal}`;
  if (type === "image_occlusion") return `Box ${ordinal}`;
  if (type === "reverse") return ordinal === 0 ? "Front → back" : "Back → front";
  return "Card";
}

/** The card's text as one line for lists and search: deletions shown as their answers. */
export function cardPreview(card: Pick<CardContent, "type" | "front" | "frontImageId">): string {
  const text = (card.type === "cloze" ? clozePlainText(card.front) : card.front).replace(/\s+/g, " ").trim();
  if (text) return text;
  if (card.type === "image_occlusion") return "Image occlusion";
  return card.frontImageId ? "Picture" : "";
}

/** Why a card can't be saved as written, or null when it can. */
export function cardProblem(card: CardContent): string | null {
  if (card.type === "image_occlusion") {
    if (!card.frontImageId) return "Add the picture to hide parts of.";
    return occlusionProblem(card.occlusions ?? []);
  }
  if (card.type === "cloze") {
    if (card.front.trim() === "") return "Write the text with its deletions.";
    if (clozeNumbers(card.front).length === 0) {
      return "Add at least one deletion, written like {{c1::answer}}.";
    }
    return null;
  }
  if (card.front.trim() === "" && !card.frontImageId) return "Write the front of the card, or add a picture.";
  if (card.back.trim() === "" && !card.backImageId) return "Write the back of the card, or add a picture.";
  return null;
}
