import { parseCloze } from "@/server/modules/flashcards/domain/cloze";
import { type CardType, itemFaces } from "@/server/modules/flashcards/domain/items";

/**
 * Practice quizzes made from the student's own flashcards (ADR-017). Each
 * question is one reviewable item of a card, asked as multiple choice, as a
 * typed answer, or (when the answer is too long to type and mark fairly) as
 * a question the student marks themselves after seeing the answer.
 * Everything here is pure, so the quiz screen and the server mark answers
 * the same way.
 */

export const QUIZ_FORMATS = ["choice", "typed", "mixed"] as const;
export type QuizFormat = (typeof QUIZ_FORMATS)[number];

export const QUIZ_FORMAT_LABELS: Record<QuizFormat, string> = {
  choice: "Multiple choice",
  typed: "Type the answer",
  mixed: "A mix of both",
};

export const QUESTION_KINDS = ["choice", "typed", "self"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUIZ_LENGTHS = [10, 20, 30] as const;

export const QUIZ_LIMITS = {
  /** The most questions one quiz asks. */
  questions: 50,
  /** The most items read to build a quiz and its wrong options. */
  pool: 2_000,
  /** Options shown for a multiple choice question, the right one included. */
  options: 4,
  /** Answers longer than this are marked by the student rather than typed. */
  typedLength: 60,
  /** Longest typed answer accepted. */
  answerLength: 500,
} as const;

/** One reviewable item of a card, as a quiz is built from it. */
export type QuizItem = {
  cardId: string;
  ordinal: number;
  subjectId: string;
  type: CardType;
  front: string;
  back: string;
};

/** The answer an item expects, as text: the back of the card, or the hidden words of a cloze deletion. */
export function expectedAnswer(item: Pick<QuizItem, "type" | "front" | "back">, ordinal: number): string {
  if (item.type === "cloze") {
    return parseCloze(item.front)
      .filter((p) => p.kind === "cloze" && p.number === ordinal)
      .map((p) => (p.kind === "cloze" ? p.answer.trim() : ""))
      .join(" … ");
  }
  const faces = itemFaces(item, ordinal);
  return faces.kind === "plain" ? faces.answer.trim() : "";
}

/**
 * Text compared when marking: lower case, accents and punctuation removed,
 * spaces collapsed, and a leading "a", "an" or "the" dropped. Digits, letters
 * in any script, and the signs that change a maths answer (+ − = . , / ^) stay.
 */
export function normaliseAnswer(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[^\p{L}\p{N}\s+\-=.,/^]/gu, " ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|an|a) /, "");
}

/** The number of single-character edits between two strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** How many typing slips a typed answer of this length may have and still count. Numbers must be exact. */
function slipsAllowed(answer: string): number {
  if (/\d/.test(answer)) return 0;
  if (answer.length >= 12) return 2;
  if (answer.length >= 5) return 1;
  return 0;
}

export type TypedMark = { correct: boolean; close: boolean };

/**
 * Marks a typed answer. An exact match (after normalising) is right; one
 * within a typing slip or two is right but "close", so the student sees the
 * spelling. Words in brackets in the expected answer are optional.
 */
export function markTyped(given: string, expected: string): TypedMark {
  const g = normaliseAnswer(given);
  if (g === "") return { correct: false, close: false };
  const forms = new Set([normaliseAnswer(expected), normaliseAnswer(expected.replace(/\([^)]*\)/g, " "))]);
  for (const form of forms) if (form !== "" && g === form) return { correct: true, close: false };
  for (const form of forms) {
    if (form !== "" && editDistance(g, form) <= slipsAllowed(form)) return { correct: true, close: true };
  }
  return { correct: false, close: false };
}

/** Whether an answer is short and plain enough to be typed and marked fairly. */
export function canBeTyped(expected: string): boolean {
  return (
    expected.length > 0 &&
    expected.length <= QUIZ_LIMITS.typedLength &&
    !expected.includes("\n") &&
    // LaTeX can be written many equivalent ways, so maths answers are self-marked.
    !expected.includes("$") &&
    !expected.includes("\\")
  );
}

/** A random number source in [0, 1). Tests pass a seeded one. */
export type Random = () => number;

export function shuffle<T>(list: readonly T[], random: Random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A small seeded generator (mulberry32), for repeatable quizzes in tests. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Wrong options for a multiple choice question: answers of other cards in
 * the same subject, of the same kind (cloze words with cloze words), as
 * close in length to the right answer as possible, and never one that reads
 * the same as it. Returns fewer than asked when the subject has too few.
 */
export function pickDistractors(item: QuizItem, expected: string, pool: QuizItem[], count: number, random: Random) {
  const right = normaliseAnswer(expected);
  const seen = new Set([right]);
  const candidates: string[] = [];
  for (const other of shuffle(pool, random)) {
    if (other.cardId === item.cardId || other.subjectId !== item.subjectId) continue;
    if ((other.type === "cloze") !== (item.type === "cloze")) continue;
    const text = expectedAnswer(other, other.ordinal);
    const key = normaliseAnswer(text);
    if (key === "" || seen.has(key) || text.length > QUIZ_LIMITS.typedLength * 3) continue;
    seen.add(key);
    candidates.push(text);
  }
  // The closest in length look most plausible; take a random few of the closest.
  const closest = candidates
    .map((text) => ({ text, gap: Math.abs(Math.log((text.length + 1) / (expected.length + 1))) }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, count * 2)
    .map((c) => c.text);
  return shuffle(closest, random).slice(0, count);
}

/** One question as it is stored and sent to the quiz screen. */
export type QuizQuestion = {
  cardId: string;
  ordinal: number;
  kind: QuestionKind;
  expected: string;
  /** The options shown, in order, for a multiple choice question. */
  options: string[] | null;
};

/**
 * Builds a quiz: up to `count` questions from `candidates`, at most one per
 * card (so a reversed card can't give away its own answer), with wrong
 * options drawn from `pool`. "mixed" asks every other question as multiple
 * choice. A question falls back to typing when there aren't enough wrong
 * options, and to self-marking when its answer can't be typed.
 */
export function buildQuiz(
  candidates: QuizItem[],
  pool: QuizItem[],
  opts: { count: number; format: QuizFormat; random: Random },
): QuizQuestion[] {
  const picked: QuizItem[] = [];
  const cards = new Set<string>();
  for (const item of shuffle(candidates, opts.random)) {
    if (picked.length >= opts.count) break;
    if (cards.has(item.cardId) || expectedAnswer(item, item.ordinal) === "") continue;
    cards.add(item.cardId);
    picked.push(item);
  }
  return picked.map((item, i) => {
    const expected = expectedAnswer(item, item.ordinal);
    const wantsChoice = opts.format === "choice" || (opts.format === "mixed" && i % 2 === 0);
    if (wantsChoice) {
      const wrong = pickDistractors(item, expected, pool, QUIZ_LIMITS.options - 1, opts.random);
      if (wrong.length >= 2) {
        return {
          cardId: item.cardId,
          ordinal: item.ordinal,
          kind: "choice",
          expected,
          options: shuffle([expected, ...wrong], opts.random),
        };
      }
    }
    const kind: QuestionKind = canBeTyped(expected) ? "typed" : "self";
    return { cardId: item.cardId, ordinal: item.ordinal, kind, expected, options: null };
  });
}

/** What the student answered. */
export type QuizAnswer =
  { kind: "choice"; option: number } | { kind: "typed"; text: string } | { kind: "self"; correct: boolean };

export type Marked = { correct: boolean; close: boolean; given: string };

/** Marks an answer against its question. A self-marked question takes the student's word. */
export function markAnswer(question: Pick<QuizQuestion, "kind" | "expected" | "options">, answer: QuizAnswer): Marked {
  if (question.kind === "choice" && answer.kind === "choice") {
    const given = question.options?.[answer.option] ?? "";
    return { correct: given !== "" && given === question.expected, close: false, given };
  }
  if (question.kind === "typed" && answer.kind === "typed") {
    return { ...markTyped(answer.text, question.expected), given: answer.text.trim() };
  }
  if (question.kind === "self" && answer.kind === "self") {
    return { correct: answer.correct, close: false, given: "" };
  }
  throw new Error("That answer doesn't fit the question.");
}

/** A score as a whole percentage, or null when nothing was answered. */
export function percent(correct: number, answered: number): number | null {
  return answered > 0 ? Math.round((correct / answered) * 100) : null;
}
