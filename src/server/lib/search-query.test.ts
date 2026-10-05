import { describe, expect, it } from "vitest";
import {
  buildPrefixQuery,
  escapeLike,
  HIGHLIGHT_END as E,
  HIGHLIGHT_START as S,
  normaliseQuery,
  parseHighlights,
} from "./search-query";

describe("buildPrefixQuery", () => {
  it("matches every word as a prefix", () => {
    expect(buildPrefixQuery("entro")).toBe("entro:*");
    expect(buildPrefixQuery("second law")).toBe("second:* & law:*");
  });

  it("lower-cases and keeps letters from any language and digits", () => {
    expect(buildPrefixQuery("Thermodynamik Größe 2")).toBe("thermodynamik:* & größe:* & 2:*");
  });

  it("keeps quoted words together", () => {
    expect(buildPrefixQuery('"cell membrane" transport')).toBe("(cell <-> membrane:*) & transport:*");
  });

  it("handles an unfinished quote while typing", () => {
    expect(buildPrefixQuery('"cell mem')).toBe("(cell <-> mem:*)");
  });

  it("excludes words after a minus sign", () => {
    expect(buildPrefixQuery("enzyme -kinetics")).toBe("enzyme:* & !kinetics");
    expect(buildPrefixQuery('enzyme -"rate law"')).toBe("enzyme:* & !(rate <-> law:*)");
  });

  it("treats words joined by punctuation as a phrase", () => {
    expect(buildPrefixQuery("x-ray")).toBe("(x <-> ray:*)");
    expect(buildPrefixQuery("H2O")).toBe("h2o:*");
  });

  it("drops tsquery syntax a student might type", () => {
    expect(buildPrefixQuery("a & b | !c:* (d)")).toBe("a:* & b:* & c:* & d:*");
    expect(buildPrefixQuery("it's")).toBe("(it <-> s:*)");
  });

  it("returns null when there is nothing to search for", () => {
    expect(buildPrefixQuery("")).toBeNull();
    expect(buildPrefixQuery("   ")).toBeNull();
    expect(buildPrefixQuery("?!&")).toBeNull();
    expect(buildPrefixQuery("-only -exclusions")).toBeNull();
    expect(buildPrefixQuery('""')).toBeNull();
  });

  it("caps the number of terms", () => {
    const query = buildPrefixQuery(Array.from({ length: 30 }, (_, i) => `w${i}`).join(" "));
    expect(query?.split(" & ")).toHaveLength(12);
  });
});

describe("normaliseQuery", () => {
  it("collapses whitespace and caps the length", () => {
    expect(normaliseQuery("  a \n\t b ")).toBe("a b");
    expect(normaliseQuery("x".repeat(500))).toHaveLength(200);
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("parseHighlights", () => {
  it("splits a headline into plain and highlighted parts", () => {
    expect(parseHighlights(`The ${S}cell${E} is the basic unit of ${S}life${E}.`)).toEqual([
      { text: "The ", match: false },
      { text: "cell", match: true },
      { text: " is the basic unit of ", match: false },
      { text: "life", match: true },
      { text: ".", match: false },
    ]);
  });

  it("merges adjacent highlights and collapses whitespace", () => {
    expect(parseHighlights(`${S}second${E} ${S}law${E}\n\nof`)).toEqual([
      { text: "second", match: true },
      { text: " ", match: false },
      { text: "law", match: true },
      { text: " of", match: false },
    ]);
  });

  it("copes with text that has no highlight or an unclosed one", () => {
    expect(parseHighlights("plain text")).toEqual([{ text: "plain text", match: false }]);
    expect(parseHighlights(`a ${S}b`)).toEqual([
      { text: "a ", match: false },
      { text: "b", match: true },
    ]);
    expect(parseHighlights("")).toEqual([]);
  });
});
