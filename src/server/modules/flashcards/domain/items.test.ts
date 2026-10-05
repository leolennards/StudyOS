import { describe, expect, it } from "vitest";
import { cardOrdinals, cardPreview, cardProblem, itemFaces, itemLabel } from "./items";

describe("cardOrdinals", () => {
  it("gives one item for basic, two for reversed and one per cloze number", () => {
    expect(cardOrdinals({ type: "basic", front: "Q" })).toEqual([0]);
    expect(cardOrdinals({ type: "reverse", front: "Q" })).toEqual([0, 1]);
    expect(cardOrdinals({ type: "cloze", front: "{{c2::a}} {{c5::b}} {{c2::c}}" })).toEqual([2, 5]);
  });
});

describe("itemFaces", () => {
  it("asks a reversed card both ways", () => {
    const card = { type: "reverse" as const, front: "Hund", back: "Dog" };
    expect(itemFaces(card, 0)).toEqual({ kind: "plain", question: "Hund", answer: "Dog" });
    expect(itemFaces(card, 1)).toEqual({ kind: "plain", question: "Dog", answer: "Hund" });
  });

  it("turns a cloze item into a blank and its answer, with the extra text", () => {
    const faces = itemFaces({ type: "cloze", front: "{{c1::Na}} is sodium", back: "Group 1" }, 1);
    expect(faces).toMatchObject({ kind: "cloze", extra: "Group 1" });
    if (faces.kind !== "cloze") throw new Error("expected a cloze");
    expect(faces.question[0]).toEqual({ text: "…", mark: "blank" });
    expect(faces.answer[0]).toEqual({ text: "Na", mark: "answer" });
  });
});

describe("cardProblem", () => {
  it("needs both sides of a basic card", () => {
    expect(cardProblem({ type: "basic", front: " ", back: "A" })).toMatch(/front/);
    expect(cardProblem({ type: "basic", front: "Q", back: "" })).toMatch(/back/);
    expect(cardProblem({ type: "reverse", front: "Q", back: "A" })).toBeNull();
  });

  it("needs at least one deletion in a cloze card, but no back", () => {
    expect(cardProblem({ type: "cloze", front: "No deletions here", back: "" })).toMatch(/deletion/);
    expect(cardProblem({ type: "cloze", front: "A {{c1::deletion}}", back: "" })).toBeNull();
  });
});

describe("labels and previews", () => {
  it("names items and flattens cloze text", () => {
    expect(itemLabel("reverse", 1)).toBe("Back → front");
    expect(itemLabel("cloze", 3)).toBe("c3");
    expect(cardPreview({ type: "cloze", front: "The  {{c1::cell}}\nwall" })).toBe("The cell wall");
  });
});
