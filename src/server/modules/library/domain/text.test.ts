import { describe, expect, it } from "vitest";
import { needsOcr, normaliseText } from "./text";

describe("normaliseText", () => {
  it("collapses spaces, trims lines and keeps paragraph breaks", () => {
    expect(normaliseText("  Title \r\n\r\n\r\n\r\nBody   text\u0007 here  ")).toBe("Title\n\nBody text here");
  });
});

describe("needsOcr", () => {
  it("trusts a page with a real text layer", () => {
    expect(needsOcr("The cell is the basic unit of life. Every organism is made of cells.")).toBe(false);
  });

  it("sends empty, near-empty and garbled pages to OCR", () => {
    expect(needsOcr("")).toBe(true);
    expect(needsOcr("12 ")).toBe(true);
    expect(needsOcr("abcdefghijklmnopqrstuvwxyz ¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤")).toBe(true);
  });
});
