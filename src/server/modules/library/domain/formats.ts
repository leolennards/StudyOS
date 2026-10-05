/**
 * The file types StudyOS accepts (Architecture §39, allowlist) and how each
 * is recognised. The extension and the browser's declared type are only a
 * first filter; the worker decides from the file's own bytes.
 */
export const DOCUMENT_FORMATS = ["pdf", "docx", "pptx", "txt", "md", "png", "jpeg", "webp"] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export const MIME_TYPES: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const EXTENSIONS: Record<string, DocumentFormat> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
};

/** Formats that are refused with a specific reason rather than "not supported". */
const REFUSED: Record<string, string> = {
  docm: "Macro-enabled Word files aren't accepted. Save it as a regular .docx and upload that.",
  pptm: "Macro-enabled PowerPoint files aren't accepted. Save it as a regular .pptx and upload that.",
  doc: "Older .doc files aren't supported yet. Save it as .docx or PDF and upload that.",
  ppt: "Older .ppt files aren't supported yet. Save it as .pptx or PDF and upload that.",
  heic: "HEIC photos aren't supported yet. Export it as JPEG or PNG and upload that.",
  heif: "HEIC photos aren't supported yet. Export it as JPEG or PNG and upload that.",
};

/** Accept attribute for the file picker. */
export const ACCEPT_ATTRIBUTE = [
  ...Object.keys(EXTENSIONS).map((e) => `.${e}`),
  ...new Set(Object.values(MIME_TYPES)),
].join(",");

export const FORMAT_LABELS: Record<DocumentFormat, string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  txt: "Text",
  md: "Markdown",
  png: "PNG image",
  jpeg: "JPEG image",
  webp: "WebP image",
};

export const isImageFormat = (f: DocumentFormat) => f === "png" || f === "jpeg" || f === "webp";
export const isTextFormat = (f: DocumentFormat) => f === "txt" || f === "md";

export function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/** The format a filename claims, or the reason it will be refused. */
export function formatFromFilename(filename: string): { format: DocumentFormat } | { error: string } {
  const ext = extensionOf(filename);
  const format = EXTENSIONS[ext];
  if (format) return { format };
  if (REFUSED[ext]) return { error: REFUSED[ext] };
  return {
    error: "That file type isn't supported. Upload a PDF, Word, PowerPoint, text, Markdown or image file.",
  };
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

/**
 * The container a file's bytes say it is (Architecture §39, magic bytes).
 * Office files are ZIP archives, so `zip` is narrowed to docx or pptx by
 * looking inside; text is anything that decodes as UTF-8 without NUL bytes.
 */
export function sniffContainer(bytes: Uint8Array): "pdf" | "zip" | "png" | "jpeg" | "webp" | "text" | "unknown" {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (looksLikeText(bytes)) return "text";
  return "unknown";
}

function looksLikeText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    // A sample can cut a multi-byte character in half, so allow a short tail.
    new TextDecoder("utf-8", { fatal: true }).decode(trimPartialUtf8(sample));
    return true;
  } catch {
    return false;
  }
}

function trimPartialUtf8(bytes: Uint8Array) {
  const end = bytes.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const b = bytes[end - i]!;
    if ((b & 0xc0) === 0xc0) return bytes.subarray(0, end - i); // a lead byte near the end
    if ((b & 0x80) === 0) break;
  }
  return bytes;
}

/** Whether the sniffed container is consistent with the format the filename declared. */
export function containerMatches(declared: DocumentFormat, container: ReturnType<typeof sniffContainer>) {
  switch (declared) {
    case "pdf":
      return container === "pdf";
    case "docx":
    case "pptx":
      return container === "zip";
    case "txt":
    case "md":
      return container === "text";
    default:
      return container === declared;
  }
}
