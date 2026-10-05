/** Processing limits (Architecture §39). Generous for coursework, small enough to keep one job bounded. */
export const PROCESSING_LIMITS = {
  /** Pages or slides in one document. */
  maxPages: 2000,
  /** Pages per document sent to OCR; the rest stay without text and the student is told. */
  maxOcrPages: 300,
  /** Office files are ZIP archives: decompressed size and entry-count guards against zip bombs. */
  maxUnzippedBytes: 300 * 1024 * 1024,
  maxZipEntries: 5000,
  /** Images are re-encoded to at most this many pixels on the longest side. */
  maxImageDimension: 4096,
  /** Images larger than this many pixels in total are refused before decoding. */
  maxImagePixels: 80_000_000,
  /** Characters kept from a text or Markdown file. */
  maxTextCharacters: 5_000_000,
} as const;

export const TITLE_MAX = 200;
export const FILENAME_MAX = 255;
/** Files offered in one upload. */
export const MAX_FILES_PER_UPLOAD = 20;
