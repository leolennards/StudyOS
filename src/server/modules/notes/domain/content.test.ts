import { describe, expect, it } from "vitest";
import {
  countWords,
  displayTitle,
  emptyNoteContent,
  excerpt,
  isSafeHref,
  type NoteNode,
  noteContentToText,
  validateNoteContent,
} from "./content";

const p = (...content: NoteNode[]): NoteNode => ({ type: "paragraph", content });
const t = (text: string, marks?: NoteNode["marks"]): NoteNode => ({ type: "text", text, marks });
const doc = (...content: NoteNode[]): NoteNode => ({ type: "doc", content });

const sample = doc(
  { type: "heading", attrs: { level: 1 }, content: [t("Thermodynamics")] },
  p(
    t("The "),
    t("second law", [{ type: "bold" }]),
    t(" says entropy "),
    { type: "inlineMath", attrs: { latex: "\\Delta S \\ge 0" } },
    t("."),
  ),
  {
    type: "bulletList",
    content: [
      { type: "listItem", content: [p(t("Closed systems"))] },
      { type: "listItem", content: [p(t("Open systems"))] },
    ],
  },
  { type: "blockMath", attrs: { latex: "S = k_B \\ln W" } },
  {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableHeader", content: [p(t("Term"))] },
          { type: "tableHeader", content: [p(t("Unit"))] },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [p(t("Entropy"))] },
          { type: "tableCell", content: [p(t("J/K"))] },
        ],
      },
    ],
  },
  { type: "codeBlock", content: [t("print('hi')\nprint('bye')")] },
  p(t("line one"), { type: "hardBreak" }, t("line two")),
  p(),
  p(),
  p(t("Done")),
);

describe("noteContentToText", () => {
  it("puts each block on its own line and keeps maths as LaTeX", () => {
    expect(noteContentToText(sample)).toBe(
      [
        "Thermodynamics",
        "The second law says entropy \\Delta S \\ge 0.",
        "Closed systems",
        "Open systems",
        "S = k_B \\ln W",
        "Term Unit",
        "Entropy J/K",
        "print('hi')",
        "print('bye')",
        "line one",
        "line two",
        "",
        "Done",
      ].join("\n"),
    );
  });

  it("is empty for an empty note", () => {
    expect(noteContentToText(emptyNoteContent())).toBe("");
  });
});

describe("validateNoteContent", () => {
  it("accepts what the editor produces", () => {
    expect(validateNoteContent(sample)).toBeNull();
    expect(validateNoteContent(emptyNoteContent())).toBeNull();
  });

  it("refuses anything that isn't a document", () => {
    expect(validateNoteContent(null)).not.toBeNull();
    expect(validateNoteContent("text")).not.toBeNull();
    expect(validateNoteContent([])).not.toBeNull();
    expect(validateNoteContent({ type: "paragraph" })).not.toBeNull();
  });

  it("refuses unknown blocks and marks", () => {
    expect(validateNoteContent(doc({ type: "iframe" }))).toMatch(/kind of block/);
    expect(validateNoteContent(doc(p(t("x", [{ type: "script" }]))))).toMatch(/formatting/);
  });

  it("refuses malformed nodes", () => {
    expect(validateNoteContent(doc({ type: "paragraph", content: "x" } as never))).not.toBeNull();
    expect(validateNoteContent(doc({ type: "paragraph", text: "x" }))).not.toBeNull();
    expect(validateNoteContent(doc({ type: "paragraph", attrs: [] } as never))).not.toBeNull();
    expect(validateNoteContent(doc(p({ type: "text", text: 5 } as never)))).not.toBeNull();
  });

  it("refuses links that could run code", () => {
    const link = (href: string) => doc(p(t("x", [{ type: "link", attrs: { href } }])));
    expect(validateNoteContent(link("https://example.com"))).toBeNull();
    expect(validateNoteContent(link("javascript:alert(1)"))).toMatch(/link/);
    expect(validateNoteContent(link("data:text/html,hi"))).toMatch(/link/);
  });

  it("refuses very deep nesting", () => {
    let node: NoteNode = p(t("deep"));
    for (let i = 0; i < 40; i++) node = { type: "blockquote", content: [node] };
    expect(validateNoteContent(doc(node))).toMatch(/nested/);
  });
});

describe("isSafeHref", () => {
  it("allows web and email links only", () => {
    expect(isSafeHref("http://a.test")).toBe(true);
    expect(isSafeHref("HTTPS://a.test")).toBe(true);
    expect(isSafeHref("mailto:me@a.test")).toBe(true);
    expect(isSafeHref(" javascript:void(0)")).toBe(false);
    expect(isSafeHref("/relative")).toBe(false);
    expect(isSafeHref(undefined)).toBe(false);
  });
});

describe("helpers", () => {
  it("counts words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("The cell's membrane, 2 layers — isn't it?")).toBe(7);
  });

  it("makes short excerpts on a word boundary", () => {
    expect(excerpt("short")).toBe("short");
    const long = "word ".repeat(100);
    const out = excerpt(long, 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });

  it("names untitled notes", () => {
    expect(displayTitle("  ")).toBe("Untitled note");
    expect(displayTitle("Week 1")).toBe("Week 1");
  });
});
