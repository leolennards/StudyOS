import { describe, expect, it } from "vitest";
import { cardOrdinals, cardPreview, cardProblem, itemFaces, itemLabel } from "./items";

const boxes = [
  { n: 3, x: 0.5, y: 0.5, w: 0.2, h: 0.1 },
  { n: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
];

describe("cardOrdinals", () => {
  it("gives one item for basic, two for reversed and one per cloze number", () => {
    expect(cardOrdinals({ type: "basic", front: "Q" })).toEqual([0]);
    expect(cardOrdinals({ type: "reverse", front: "Q" })).toEqual([0, 1]);
    expect(cardOrdinals({ type: "cloze", front: "{{c2::a}} {{c5::b}} {{c2::c}}" })).toEqual([2, 5]);
  });

  it("gives an image occlusion card one item per box, by box number", () => {
    expect(cardOrdinals({ type: "image_occlusion", front: "", occlusions: boxes })).toEqual([1, 3]);
  });
});

describe("itemFaces", () => {
  it("asks a reversed card both ways", () => {
    const card = { type: "reverse" as const, front: "Hund", back: "Dog" };
    expect(itemFaces(card, 0)).toMatchObject({ kind: "plain", question: "Hund", answer: "Dog" });
    expect(itemFaces(card, 1)).toMatchObject({ kind: "plain", question: "Dog", answer: "Hund" });
  });

  it("turns pictures round with the text on a reversed card", () => {
    const card = { type: "reverse" as const, front: "", back: "Heart", frontImageId: "img-f", backImageId: null };
    expect(itemFaces(card, 0)).toEqual({
      kind: "plain",
      question: "",
      answer: "Heart",
      questionImageId: "img-f",
      answerImageId: null,
    });
    expect(itemFaces(card, 1)).toMatchObject({ question: "Heart", questionImageId: null, answerImageId: "img-f" });
  });

  it("asks one box of an image occlusion card at a time", () => {
    const faces = itemFaces(
      { type: "image_occlusion", front: "Name the chamber", back: "", frontImageId: "img", occlusions: boxes },
      3,
    );
    expect(faces).toEqual({
      kind: "occlusion",
      prompt: "Name the chamber",
      imageId: "img",
      boxes,
      target: 3,
      extra: "",
    });
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
  it("needs both sides of a basic card, as text or a picture", () => {
    expect(cardProblem({ type: "basic", front: " ", back: "A" })).toMatch(/front/);
    expect(cardProblem({ type: "basic", front: "Q", back: "" })).toMatch(/back/);
    expect(cardProblem({ type: "reverse", front: "Q", back: "A" })).toBeNull();
    expect(cardProblem({ type: "basic", front: "", back: "Aorta", frontImageId: "img" })).toBeNull();
    expect(cardProblem({ type: "basic", front: "What is this?", back: "", backImageId: "img" })).toBeNull();
  });

  it("needs a picture and at least one valid box on an image occlusion card", () => {
    expect(cardProblem({ type: "image_occlusion", front: "", back: "", occlusions: boxes })).toMatch(/picture/);
    expect(cardProblem({ type: "image_occlusion", front: "", back: "", frontImageId: "img", occlusions: [] })).toMatch(
      /box/,
    );
    expect(
      cardProblem({ type: "image_occlusion", front: "", back: "", frontImageId: "img", occlusions: boxes }),
    ).toBeNull();
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
    expect(itemLabel("image_occlusion", 2)).toBe("Box 2");
  });

  it("names cards that are only a picture", () => {
    expect(cardPreview({ type: "image_occlusion", front: "" })).toBe("Image occlusion");
    expect(cardPreview({ type: "image_occlusion", front: "Label the heart" })).toBe("Label the heart");
    expect(cardPreview({ type: "basic", front: " ", frontImageId: "img" })).toBe("Picture");
  });
});
