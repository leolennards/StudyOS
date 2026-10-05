import { describe, expect, it } from "vitest";
import { clozeNumbers, clozePlainText, parseCloze, renderCloze } from "./cloze";

describe("parseCloze", () => {
  it("splits text and deletions, with optional hints", () => {
    expect(parseCloze("The {{c1::mitochondria}} makes {{c2::ATP::a molecule}}.")).toEqual([
      { kind: "text", text: "The " },
      { kind: "cloze", number: 1, answer: "mitochondria", hint: null },
      { kind: "text", text: " makes " },
      { kind: "cloze", number: 2, answer: "ATP", hint: "a molecule" },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves malformed or out-of-range deletions as typed", () => {
    expect(parseCloze("{{c0::zero}} {{c21::big}} {{c1::}} {{c1 x}}")).toEqual([
      { kind: "text", text: "{{c0::zero}} {{c21::big}} {{c1::}} {{c1 x}}" },
    ]);
  });

  it("keeps maths inside a deletion", () => {
    expect(parseCloze("Energy is {{c1::$E = mc^2$}}")[1]).toEqual({
      kind: "cloze",
      number: 1,
      answer: "$E = mc^2$",
      hint: null,
    });
  });
});

describe("clozeNumbers", () => {
  it("returns each distinct number once, ascending", () => {
    expect(clozeNumbers("{{c3::a}} {{c1::b}} {{c3::c}}")).toEqual([1, 3]);
    expect(clozeNumbers("no deletions")).toEqual([]);
  });
});

describe("renderCloze", () => {
  const text = "{{c1::Paris}} is the capital of {{c2::France::country}}.";

  it("hides the asked deletion and shows the others", () => {
    expect(renderCloze(text, 2, "question")).toEqual([
      { text: "Paris", mark: "none" },
      { text: " is the capital of ", mark: "none" },
      { text: "country", mark: "blank" },
      { text: ".", mark: "none" },
    ]);
    expect(renderCloze(text, 1, "question")[0]).toEqual({ text: "…", mark: "blank" });
  });

  it("marks the answer on the answer side", () => {
    expect(renderCloze(text, 2, "answer")[2]).toEqual({ text: "France", mark: "answer" });
  });

  it("hides every deletion that shares the number", () => {
    const parts = renderCloze("{{c1::H}} and {{c1::O}}", 1, "question");
    expect(parts.filter((p) => p.mark === "blank")).toHaveLength(2);
  });
});

describe("clozePlainText", () => {
  it("shows every deletion as its answer", () => {
    expect(clozePlainText("{{c1::Paris}} is in {{c2::France::country}}")).toBe("Paris is in France");
  });
});
