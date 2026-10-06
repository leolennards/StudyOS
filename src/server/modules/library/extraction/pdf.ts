import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { PROCESSING_LIMITS } from "../domain/limits";
import { normaliseText } from "../domain/text";
import { ProcessingError } from "./types";

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

/** Opens a PDF. pdf.js in Node never runs a PDF's scripts, and XFA forms stay off (Architecture §39). */
export async function openPdf(data: Uint8Array): Promise<PdfDocument> {
  try {
    // pdf.js takes ownership of the buffer it is given, so it gets a copy.
    return await getDocumentProxy(new Uint8Array(data), { enableXfa: false, stopAtErrors: false });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "PasswordException") {
      throw new ProcessingError("This PDF is password-protected. Remove the password and upload it again.");
    }
    throw new ProcessingError("This PDF is damaged and couldn't be opened.", { cause: error });
  }
}

/** The text layer of every page. Pages without one come back empty. */
export async function readPdfText(pdf: PdfDocument) {
  if (pdf.numPages > PROCESSING_LIMITS.maxPages) {
    throw new ProcessingError(
      `This PDF has ${pdf.numPages} pages. The limit is ${PROCESSING_LIMITS.maxPages}; split it into parts and upload those.`,
    );
  }
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((t) => normaliseText(t));
}

/**
 * Renders one page to PNG for OCR, as many pixels across as `targetWidth`
 * asks for. Wider is more accurate and uses more memory, which is what
 * limits a small machine (OCR_RENDER_WIDTH in the README).
 */
export async function renderPdfPage(pdf: PdfDocument, pageNumber: number, targetWidth: number) {
  const page = await pdf.getPage(pageNumber);
  const { width } = page.getViewport({ scale: 1 });
  const scale = Math.min(4, Math.max(1, targetWidth / width));
  const png = await renderPageAsImage(pdf, pageNumber, { canvasImport: () => import("@napi-rs/canvas"), scale });
  // pdf.js holds each rendered page's fonts, images and operator list until
  // asked to let go; over a long scanned document that is hundreds of
  // megabytes, which a small machine does not have.
  page.cleanup();
  await pdf.cleanup();
  return Buffer.from(png);
}

/** Releases the document and pdf.js's worker resources. */
export const closePdf = (pdf: PdfDocument) => pdf.loadingTask.destroy();
