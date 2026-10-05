/**
 * A Content-Disposition header that is safe for any filename: an ASCII
 * fallback plus the RFC 5987 UTF-8 form, with quotes and control
 * characters removed so a filename cannot inject header content.
 */
export function contentDisposition(disposition: "inline" | "attachment", filename: string) {
  const cleaned = filename.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim() || "document";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}
