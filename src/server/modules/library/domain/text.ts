/**
 * Text clean-up and the per-page "does this need OCR?" test
 * (Architecture §10, tier 0: use the text layer when it is present and
 * sensible).
 */

/** Collapses runs of spaces, trims lines and drops control characters, keeping paragraph breaks. */
export function normaliseText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Below this many letters a PDF page is treated as having no usable text layer. */
export const MIN_LETTERS_PER_PAGE = 20;

/**
 * Whether a page's extracted text is too thin or too garbled to trust, so
 * the page should be read by OCR instead. Garbled text layers (broken font
 * encodings) show up as a low share of letters and digits.
 */
export function needsOcr(text: string) {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters < MIN_LETTERS_PER_PAGE) return true;
  const visible = text.replace(/\s/g, "").length;
  const wordish = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return visible > 0 && wordish / visible < 0.5;
}

export const countCharacters = (text: string) => text.replace(/\s/g, "").length;
