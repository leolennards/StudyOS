import { unzipSync } from "fflate";
import { PROCESSING_LIMITS } from "../domain/limits";
import { ProcessingError } from "./types";

/**
 * Reads entries from an Office file (a ZIP archive) with the guards
 * Architecture §39 asks for: a cap on entries and on decompressed size
 * (zip bombs), no absolute or parent-relative paths, and no macros.
 */
export function readOfficeZip(data: Uint8Array, wanted: (name: string) => boolean) {
  let entries = 0;
  let total = 0;
  const names: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter(file) {
        entries += 1;
        total += file.originalSize;
        if (entries > PROCESSING_LIMITS.maxZipEntries || total > PROCESSING_LIMITS.maxUnzippedBytes) {
          throw new ProcessingError("This file is too large to open once decompressed.");
        }
        if (file.name.startsWith("/") || file.name.split(/[\\/]/).includes("..")) {
          throw new ProcessingError("This file contains unsafe paths and was not opened.");
        }
        names.push(file.name);
        return wanted(file.name);
      },
    });
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    throw new ProcessingError("This file is damaged or isn't a real Office document.", { cause: error });
  }
  if (names.some((n) => /(^|\/)vbaProject\.bin$/i.test(n))) {
    throw new ProcessingError("Files containing macros aren't accepted. Save it without macros and upload it again.");
  }
  return { files, names };
}

/** Which Office format a ZIP archive is, from the parts it contains. */
export function officeKind(names: string[]): "docx" | "pptx" | null {
  if (names.includes("word/document.xml")) return "docx";
  if (names.includes("ppt/presentation.xml")) return "pptx";
  return null;
}

/** Decodes the five predefined XML entities and numeric character references. */
export function decodeXmlEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
