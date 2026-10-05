import { PROCESSING_LIMITS } from "../domain/limits";
import { normaliseText } from "../domain/text";
import type { Block } from "./types";

/** Decodes a text file as UTF-8 (dropping a byte-order mark), falling back to Windows-1252. */
export function decodeText(data: Uint8Array) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(data);
  } catch {
    text = new TextDecoder("windows-1252").decode(data);
  }
  return text.slice(0, PROCESSING_LIMITS.maxTextCharacters);
}

/** Markdown headings and list items as blocks; everything else as paragraphs. */
export function markdownBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let fenced = false;
  const flush = () => {
    const text = normaliseText(paragraph.join("\n"));
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      paragraph.push(line);
      continue;
    }
    if (fenced) {
      paragraph.push(line);
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1]!.length, text: normaliseText(heading[2]!) });
    } else if (item) {
      flush();
      blocks.push({ type: "list_item", text: normaliseText(item[1]!) });
    } else if (line.trim() === "") flush();
    else paragraph.push(line);
  }
  flush();
  return blocks.filter((b) => b.text);
}
