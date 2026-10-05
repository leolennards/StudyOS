import { describe, expect, it } from "vitest";
import { guessKind, titleFromFilename } from "./kind";

describe("guessKind", () => {
  it.each([
    ["Week 3 Lecture Slides.pptx", "lecture"],
    ["L4 thermodynamics.pdf", "lecture"],
    ["CHEM201 Past Paper 2023.pdf", "past_paper"],
    ["June 2022 exam.pdf", "past_paper"],
    ["2023 Mark Scheme.pdf", "mark_scheme"],
    ["Chapter 5 - Kinetics.pdf", "textbook"],
    ["My revision notes.docx", "notes"],
    ["IMG_2041.jpg", "other"],
  ])("%s → %s", (name, kind) => {
    expect(guessKind(name)).toBe(kind);
  });
});

describe("titleFromFilename", () => {
  it("drops the extension and underscores", () => {
    expect(titleFromFilename("week_3__lecture.pdf")).toBe("week 3 lecture");
    expect(titleFromFilename(".pdf")).toBe("Untitled document");
  });
});
