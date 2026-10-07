import { describe, expect, it } from "vitest";
import {
  buildQuiz,
  canBeTyped,
  expectedAnswer,
  markAnswer,
  markTyped,
  normaliseAnswer,
  percent,
  type QuizItem,
  seededRandom,
} from "./quiz";

const card = (id: string, front: string, back: string, extra: Partial<QuizItem> = {}): QuizItem => ({
  cardId: id,
  ordinal: 0,
  subjectId: "s1",
  type: "basic",
  front,
  back,
  ...extra,
});

describe("expectedAnswer", () => {
  it("is the back, the front for a reversed card's second side, or a cloze deletion's words", () => {
    expect(expectedAnswer(card("a", "Capital of France?", " Paris "), 0)).toBe("Paris");
    expect(expectedAnswer(card("a", "chat", "cat", { type: "reverse" }), 1)).toBe("chat");
    const cloze = card("c", "{{c1::Mitosis}} makes two {{c2::identical}} {{c1::cells}}", "", { type: "cloze" });
    expect(expectedAnswer(cloze, 1)).toBe("Mitosis … cells");
    expect(expectedAnswer(cloze, 2)).toBe("identical");
  });
});

describe("normaliseAnswer", () => {
  it("ignores case, accents, punctuation and a leading article", () => {
    expect(normaliseAnswer("  The Mitochondria! ")).toBe("mitochondria");
    expect(normaliseAnswer("Café-au-lait")).toBe("cafe-au-lait");
    expect(normaliseAnswer("3.14")).toBe("3.14");
    expect(normaliseAnswer("x = 2, y = 3.")).toBe("x = 2 y = 3");
  });
});

describe("markTyped", () => {
  it("accepts exact answers and small slips, but not wrong ones", () => {
    expect(markTyped("paris", "Paris")).toEqual({ correct: true, close: false });
    expect(markTyped("mitochondira", "mitochondria")).toEqual({ correct: true, close: true });
    expect(markTyped("cat", "car")).toEqual({ correct: false, close: false });
    expect(markTyped("", "Paris")).toEqual({ correct: false, close: false });
  });

  it("wants numbers exactly and treats words in brackets as optional", () => {
    expect(markTyped("1067", "1066")).toEqual({ correct: false, close: false });
    expect(markTyped("Battle of Hastings", "Battle of Hastings (1066)")).toEqual({ correct: true, close: false });
  });
});

describe("canBeTyped", () => {
  it("leaves long, multi-line and maths answers to the student", () => {
    expect(canBeTyped("Paris")).toBe(true);
    expect(canBeTyped("a".repeat(61))).toBe(false);
    expect(canBeTyped("line one\nline two")).toBe(false);
    expect(canBeTyped("$x^2$")).toBe(false);
  });
});

describe("buildQuiz", () => {
  const pool = [
    card("1", "Capital of France?", "Paris"),
    card("2", "Capital of Spain?", "Madrid"),
    card("3", "Capital of Italy?", "Rome"),
    card("4", "Capital of Germany?", "Berlin"),
    card("5", "Explain osmosis", "Water moves across a membrane from low to high solute concentration, by diffusion."),
    card("6", "chien", "dog", { type: "reverse" }),
    card("6", "chien", "dog", { type: "reverse", ordinal: 1 }),
    card("7", "Other subject", "Lisbon", { subjectId: "s2" }),
  ];

  it("asks each card once, with the right answer among the options", () => {
    const quiz = buildQuiz(pool, pool, { count: 50, format: "choice", random: seededRandom(1) });
    expect(quiz).toHaveLength(7);
    expect(new Set(quiz.map((q) => q.cardId)).size).toBe(7);
    for (const q of quiz.filter((q) => q.kind === "choice")) {
      expect(q.options).toContain(q.expected);
      expect(new Set(q.options).size).toBe(q.options!.length);
      // Wrong options come from the same subject only.
      expect(q.options).not.toContain("Lisbon");
    }
    // The other subject has no wrong options to offer, so its card is typed instead.
    expect(quiz.find((q) => q.cardId === "7")?.kind).toBe("typed");
    // Too long to type fairly, so the student marks it.
    const osmosis = quiz.find((q) => q.cardId === "5")!;
    expect(osmosis.kind === "self" || osmosis.kind === "choice").toBe(true);
  });

  it("respects the count and alternates in a mix", () => {
    const capitals = pool.slice(0, 4);
    const quiz = buildQuiz(capitals, capitals, { count: 2, format: "mixed", random: seededRandom(7) });
    expect(quiz.map((q) => q.kind)).toEqual(["choice", "typed"]);
    expect(
      buildQuiz(capitals, capitals, { count: 50, format: "typed", random: seededRandom(2) }).every(
        (q) => q.kind === "typed",
      ),
    ).toBe(true);
  });

  it("is repeatable with the same seed", () => {
    const a = buildQuiz(pool, pool, { count: 5, format: "choice", random: seededRandom(3) });
    const b = buildQuiz(pool, pool, { count: 5, format: "choice", random: seededRandom(3) });
    expect(a).toEqual(b);
  });
});

describe("markAnswer", () => {
  it("marks each kind of question", () => {
    const choice = { kind: "choice" as const, expected: "Paris", options: ["Rome", "Paris", "Madrid"] };
    expect(markAnswer(choice, { kind: "choice", option: 1 })).toEqual({ correct: true, close: false, given: "Paris" });
    expect(markAnswer(choice, { kind: "choice", option: 0 }).correct).toBe(false);
    expect(markAnswer(choice, { kind: "choice", option: 9 }).correct).toBe(false);
    const typed = { kind: "typed" as const, expected: "Paris", options: null };
    expect(markAnswer(typed, { kind: "typed", text: " paris " })).toEqual({
      correct: true,
      close: false,
      given: "paris",
    });
    const self = { kind: "self" as const, expected: "Long answer", options: null };
    expect(markAnswer(self, { kind: "self", correct: false }).correct).toBe(false);
    expect(() => markAnswer(typed, { kind: "choice", option: 0 })).toThrow();
  });
});

describe("percent", () => {
  it("rounds, and is null with nothing answered", () => {
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBeNull();
  });
});
