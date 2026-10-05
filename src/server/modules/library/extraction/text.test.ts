import { describe, expect, it } from "vitest";
import { decodeText, markdownBlocks } from "./text";

describe("decodeText", () => {
  it("reads UTF-8 and drops a byte-order mark", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Café")]))).toBe("Café");
  });

  it("falls back to Windows-1252 for older text files", () => {
    expect(decodeText(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe("Café");
  });
});

describe("markdownBlocks", () => {
  it("turns headings, lists and paragraphs into blocks", () => {
    expect(markdownBlocks("# Title\n\nSome *text*\nmore.\n\n- one\n2. two\n\n## Next ##")).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Some *text*\nmore." },
      { type: "list_item", text: "one" },
      { type: "list_item", text: "two" },
      { type: "heading", level: 2, text: "Next" },
    ]);
  });

  it("does not read headings inside code fences", () => {
    const blocks = markdownBlocks("```\n# not a heading\n```");
    expect(blocks).toEqual([{ type: "paragraph", text: "```\n# not a heading\n```" }]);
  });
});
