import { strFromU8 } from "fflate";
import { PROCESSING_LIMITS } from "../domain/limits";
import { normaliseText } from "../domain/text";
import { decodeXmlEntities, readOfficeZip } from "./zip";
import { type Block, ProcessingError } from "./types";

/**
 * PowerPoint, one page per visible slide in presentation order: the title
 * as a heading, the other text as paragraphs, and the speaker notes, which
 * often hold the explanation the slide leaves out. Hidden slides are skipped,
 * as they are when the deck is shown or converted to PDF.
 */
export function readPptx(data: Uint8Array): Block[][] {
  const { files } = readOfficeZip(data, (name) =>
    /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/.test(
      name,
    ),
  );
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : null);

  const presentation = read("ppt/presentation.xml");
  const rels = read("ppt/_rels/presentation.xml.rels");
  if (!presentation || !rels) throw new ProcessingError("This PowerPoint file is damaged and couldn't be read.");

  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?(ppt\/)?/, "ppt/"));
  }
  const order = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map((m) => targets.get(m[1]!))
    .filter((t): t is string => Boolean(t));
  if (order.length > PROCESSING_LIMITS.maxPages) {
    throw new ProcessingError(`This presentation has more than ${PROCESSING_LIMITS.maxPages} slides.`);
  }

  const slides: Block[][] = [];
  for (const path of order) {
    const xml = read(path);
    if (!xml) continue;
    if (/<p:sld\b[^>]*\bshow="(0|false)"/.test(xml)) continue;
    const blocks = shapesToBlocks(xml);
    const notesPath = notesFor(read, path);
    const notes = notesPath ? read(notesPath) : null;
    if (notes) {
      const text = bodyText(notes, { skipPlaceholders: ["sldImg", "sldNum", "hdr", "ftr", "dt"] });
      if (text) blocks.push({ type: "note", text });
    }
    slides.push(blocks);
  }
  return slides;
}

function notesFor(read: (name: string) => string | null, slidePath: string) {
  const relsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
  const rels = read(relsPath);
  const target =
    rels && /Type="[^"]*\/notesSlide"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Type="[^"]*\/notesSlide"/.exec(rels);
  const t = target?.[1] ?? target?.[2];
  return t ? `ppt/notesSlides/${t.split("/").pop()}` : null;
}

function shapesToBlocks(xml: string): Block[] {
  const blocks: Block[] = [];
  for (const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const shape = sp[0];
    const type = placeholderType(shape);
    if (type && ["sldNum", "dt", "ftr", "hdr"].includes(type)) continue;
    const isTitle = type === "title" || type === "ctrTitle";
    for (const para of paragraphs(shape)) {
      blocks.push(isTitle ? { type: "heading", level: 1, text: para } : { type: "paragraph", text: para });
    }
  }
  return blocks;
}

/** A shape's placeholder type (title, body, sldNum…), if it is a placeholder. */
function placeholderType(shape: string) {
  const tag = /<p:ph\b[^>]*>/.exec(shape)?.[0];
  return tag ? /\btype="([^"]+)"/.exec(tag)?.[1] : undefined;
}

function paragraphs(xml: string) {
  const out: string[] = [];
  for (const p of xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)) {
    const runs = [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\/>/g)].map((m) => (m[0] === "<a:br/>" ? "\n" : m[1]!));
    const text = normaliseText(decodeXmlEntities(runs.join("")));
    if (text) out.push(text);
  }
  return out;
}

function bodyText(xml: string, opts: { skipPlaceholders: string[] }) {
  const parts: string[] = [];
  for (const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const type = placeholderType(sp[0]);
    if (type && opts.skipPlaceholders.includes(type)) continue;
    parts.push(...paragraphs(sp[0]));
  }
  return parts.join("\n");
}
