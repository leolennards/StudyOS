import { describe, expect, it } from "vitest";
import {
  ankiNoteToDraft,
  detectDelimiter,
  htmlToText,
  IMPORT_LIMITS,
  importBatches,
  looksLikeHeader,
  parseDelimited,
  planImport,
  textToDrafts,
} from "./import";

describe("htmlToText", () => {
  it("keeps line breaks and lists, drops formatting and decodes entities", () => {
    expect(htmlToText("<b>Paris</b>&nbsp;is the<br>capital &amp; largest city").text).toBe(
      "Paris is the\ncapital & largest city",
    );
    expect(htmlToText("<div>Steps:</div><ul><li>One</li><li>Two</li></ul>").text).toBe("Steps:\n\n• One\n\n• Two");
    expect(htmlToText("x &lt; y &#8594; &#x3b1;").text).toBe("x < y → α");
    expect(htmlToText("<style>.a{}</style>Hi<!-- note -->").text).toBe("Hi");
  });

  it("rewrites Anki's maths for StudyOS and reports pictures and sound", () => {
    expect(htmlToText("Area: \\( \\pi r^2 \\) and \\[E = mc^2\\]").text).toBe("Area: $\\pi r^2$ and $$E = mc^2$$");
    expect(htmlToText("[$]x^2[/$] [$$]y[/$$] [latex]z[/latex]").text).toBe("$x^2$ $$y$$ $$z$$");
    expect(htmlToText('Heart <img src="heart.png">[sound:beat.mp3]')).toEqual({ text: "Heart", hadMedia: true });
  });
});

describe("ankiNoteToDraft", () => {
  it("makes basic, reversed and cloze cards, joining the other fields into the back", () => {
    expect(ankiNoteToDraft({ fields: ["Q", "A", "", "More"], ordinals: [0] })).toEqual({
      card: { type: "basic", front: "Q", back: "A\n\nMore" },
      hadMedia: false,
    });
    expect(ankiNoteToDraft({ fields: ["chien", "dog"], ordinals: [0, 1] })).toMatchObject({
      card: { type: "reverse" },
    });
    expect(ankiNoteToDraft({ fields: ["{{c1::Paris}} is in France", ""], ordinals: [0] })).toMatchObject({
      card: { type: "cloze", back: "" },
    });
  });

  it("skips notes with nothing to ask, picture-only notes and image occlusion", () => {
    expect(ankiNoteToDraft({ fields: ["", ""], ordinals: [0] })).toMatchObject({ skip: "empty" });
    expect(ankiNoteToDraft({ fields: ["Q", ""], ordinals: [0] })).toMatchObject({ skip: "oneSided" });
    expect(ankiNoteToDraft({ fields: ['<img src="a.png">', "Heart"], ordinals: [0] })).toMatchObject({
      skip: "media",
    });
    expect(ankiNoteToDraft({ fields: ["{{c1::image-occlusion:rect:left=.1}}", ""], ordinals: [0] })).toMatchObject({
      skip: "media",
    });
    expect(ankiNoteToDraft({ fields: ["{{c99::Too high}}", ""], ordinals: [0] })).toMatchObject({ skip: "badCloze" });
  });
});

describe("delimited text", () => {
  it("reads quoted CSV fields with commas, quotes and line breaks", () => {
    const csv = 'front,back\r\n"Osmosis","Water, across a membrane"\n"Say ""hi""","Line one\nLine two"\n\n';
    expect(parseDelimited(csv, ",")).toEqual([
      { fields: ["front", "back"], quoted: false },
      { fields: ["Osmosis", "Water, across a membrane"], quoted: true },
      { fields: ['Say "hi"', "Line one\nLine two"], quoted: true },
    ]);
  });

  it("detects the delimiter and a header row", () => {
    expect(detectDelimiter("Term\tDefinition\nchien\tdog")).toBe("\t");
    expect(detectDelimiter("a;b\nc;d, e")).toBe(";");
    expect(detectDelimiter("a,b\nc,d")).toBe(",");
    expect(detectDelimiter("cat - chat\ndog - chien")).toBe(" - ");
    expect(looksLikeHeader(["Term", "Definition"])).toBe(true);
    expect(looksLikeHeader(["chien", "dog"])).toBe(false);
  });

  it("turns rows into cards, keeping the delimiter inside an unquoted back", () => {
    const drafts = textToDrafts(
      "Term,Definition\nOsmosis,water moving, by diffusion\nLonely\n{{c1::Mitosis}} splits cells,",
      {
        delimiter: ",",
        header: true,
      },
    );
    expect(drafts).toEqual([
      { card: { type: "basic", front: "Osmosis", back: "water moving, by diffusion" }, hadMedia: false },
      { skip: "oneSided", hadMedia: false },
      { card: { type: "cloze", front: "{{c1::Mitosis}} splits cells", back: "" }, hadMedia: false },
    ]);
  });
});

describe("planImport", () => {
  it("drops repeats and over-long cards, reverses basic cards on request, and stops at the limit", () => {
    const card = (front: string, back = "b") => ({ card: { type: "basic" as const, front, back }, hadMedia: false });
    const plan = planImport(
      [
        card("a"),
        card("a"),
        card("c", "x".repeat(5_001)),
        { card: { type: "cloze", front: "{{c1::x}}", back: "" }, hadMedia: true },
        { skip: "empty", hadMedia: false },
      ],
      { reverse: true },
    );
    expect(plan).toEqual({
      cards: [
        { type: "reverse", front: "a", back: "b" },
        { type: "cloze", front: "{{c1::x}}", back: "" },
      ],
      skipped: { duplicate: 1, tooLong: 1, empty: 1 },
      mediaDropped: 1,
      overLimit: 0,
    });

    const many = Array.from({ length: IMPORT_LIMITS.cards + 3 }, (_, i) => card(`q${i}`));
    const capped = planImport(many, { reverse: false });
    expect(capped.cards).toHaveLength(IMPORT_LIMITS.cards);
    expect(capped.overLimit).toBe(3);
  });
});

describe("importBatches", () => {
  it("splits by count and by size", () => {
    const small = Array.from({ length: 450 }, (_, i) => ({ type: "basic" as const, front: `q${i}`, back: "a" }));
    expect(importBatches(small).map((b) => b.length)).toEqual([200, 200, 50]);
    const big = Array.from({ length: 70 }, () => ({
      type: "basic" as const,
      front: "x".repeat(5_000),
      back: "y".repeat(5_000),
    }));
    expect(importBatches(big).map((b) => b.length)).toEqual([30, 30, 10]);
    expect(importBatches([])).toEqual([]);
  });
});
