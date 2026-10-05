import mammoth from "mammoth";
import { normaliseText } from "../domain/text";
import { decodeXmlEntities } from "./zip";
import { type Block, ProcessingError } from "./types";

/**
 * Word documents, read structurally with mammoth: headings, paragraphs and
 * list items. Used when no PDF rendering of the file is available; Word has
 * no fixed pages, so the whole document is one page.
 */
export async function readDocx(data: Buffer): Promise<Block[]> {
  let html: string;
  try {
    ({ value: html } = await mammoth.convertToHtml({ buffer: data }));
  } catch (error) {
    throw new ProcessingError("This Word document is damaged and couldn't be read.", { cause: error });
  }
  const blocks: Block[] = [];
  const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/g;
  for (const m of html.matchAll(re)) {
    const tag = m[1]!;
    const text = normaliseText(decodeXmlEntities(m[2]!.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")));
    if (!text) continue;
    if (tag.startsWith("h")) blocks.push({ type: "heading", level: Number(tag[1]), text });
    else if (tag === "li") blocks.push({ type: "list_item", text });
    else blocks.push({ type: "paragraph", text });
  }
  return blocks;
}
