import { createHash } from "node:crypto";
import { env } from "@/server/lib/env";
import { getDb } from "@/server/platform/db/client";
import { convertToPdf, libreOfficePath } from "@/server/platform/convert/libreoffice";
import { getOcr } from "@/server/platform/ocr";
import { logger } from "@/server/platform/observability/logger";
import { derivedKey, getStorage } from "@/server/platform/storage";
import { containerMatches, FORMAT_LABELS, isImageFormat, MIME_TYPES, sniffContainer } from "./domain/formats";
import { PROCESSING_LIMITS } from "./domain/limits";
import type { ProcessingStage } from "./domain/status";
import { countCharacters, needsOcr, normaliseText } from "./domain/text";
import { readDocx } from "./extraction/docx";
import { normaliseImage } from "./extraction/image";
import { closePdf, openPdf, readPdfText, renderPdfPage } from "./extraction/pdf";
import { readPptx } from "./extraction/pptx";
import { decodeText, markdownBlocks } from "./extraction/text";
import { type Block, blocksToText, type ExtractedPage, ProcessingError } from "./extraction/types";
import { officeKind, readOfficeZip } from "./extraction/zip";
import { libraryRepository as repo, type DocumentRow } from "./repository";

/**
 * The document-processing pipeline (Architecture §9, stages 1–5), run by the
 * worker for one document: validate → normalise → extract → OCR → persist.
 * Running it again on the same document replaces its pages, so a retry after
 * a crash is always safe.
 */
type Outcome = {
  pages: ExtractedPage[];
  preview: "pdf" | "image" | "text";
  previewKey: string | null;
};

type Progress = (stage: ProcessingStage, percent: number) => Promise<void>;

export type ProcessResult = "ready" | "failed" | "skipped" | "retrying";

const GENERIC_FAILURE =
  "Something went wrong while processing this file. Try again, and if it keeps failing, save it as a PDF and upload that.";

export async function processDocument(
  job: { documentId: string; workspaceId: string },
  attempt: { retryCount: number; retryLimit: number } = { retryCount: 0, retryLimit: 0 },
): Promise<ProcessResult> {
  const db = getDb();
  const ws = job.workspaceId;
  const doc = await repo.findDocument(db, ws, job.documentId);
  // Deleted while queued, not yet uploaded, or already done by an earlier attempt.
  if (!doc || doc.status === "pending_upload" || doc.status === "ready") return "skipped";

  let lastPercent = -1;
  const progress: Progress = async (stage, percent) => {
    if (percent === lastPercent && stage !== "saving") return;
    lastPercent = percent;
    await repo.updateDocument(db, ws, doc.id, { status: "processing", stage, progress: percent, errorMessage: null });
  };

  const started = Date.now();
  try {
    await progress("validating", 5);
    const original = await loadOriginal(doc);
    const outcome = await extract(doc, original, progress);

    await progress("saving", 95);
    const ocrPages = outcome.pages.filter((p) => p.ocrUsed).length;
    const updated = await db.transaction(async (tx) => {
      // The document may have been deleted while it was being processed.
      if (!(await repo.findDocument(tx, ws, doc.id))) return false;
      await repo.replacePages(
        tx,
        ws,
        doc.id,
        outcome.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
          blocks: p.blocks,
          charCount: countCharacters(p.text),
          ocrUsed: p.ocrUsed,
          ocrConfidence: p.ocrConfidence,
        })),
      );
      return repo.updateDocument(tx, ws, doc.id, {
        status: "ready",
        stage: null,
        progress: 100,
        errorMessage: null,
        pageCount: outcome.pages.length,
        ocrPageCount: ocrPages,
        preview: outcome.preview,
        previewKey: outcome.previewKey,
        processedAt: new Date(),
      });
    });
    logger.info(
      { documentId: doc.id, format: doc.format, pages: outcome.pages.length, ocrPages, ms: Date.now() - started },
      "document processed",
    );
    return updated ? "ready" : "skipped";
  } catch (error) {
    const permanent = error instanceof ProcessingError && error.permanent;
    const lastAttempt = attempt.retryCount >= attempt.retryLimit;
    if (permanent || lastAttempt) {
      const message = error instanceof ProcessingError ? error.message : GENERIC_FAILURE;
      if (!permanent) logger.error({ err: error, documentId: doc.id }, "document processing failed");
      else logger.info({ documentId: doc.id, reason: message }, "document refused");
      await repo.updateDocument(db, ws, doc.id, { status: "failed", stage: null, progress: 0, errorMessage: message });
      return "failed";
    }
    logger.warn({ err: error, documentId: doc.id, attempt: attempt.retryCount }, "document processing will retry");
    await repo.updateDocument(db, ws, doc.id, { status: "uploaded", stage: null, progress: 0 });
    throw error;
  }
}

/** Stage 1: the stored bytes must be the file the student uploaded, and of the type it claims. */
async function loadOriginal(doc: DocumentRow) {
  const storage = getStorage();
  if (!(await storage.head(doc.storageKey))) {
    throw new ProcessingError("The uploaded file is missing. Delete this document and upload it again.");
  }
  const data = await storage.get(doc.storageKey);
  if (data.length !== doc.sizeBytes || createHash("sha256").update(data).digest("hex") !== doc.sha256) {
    throw new ProcessingError("The uploaded file doesn't match what was sent. Upload it again.");
  }
  if (!containerMatches(doc.format, sniffContainer(data))) {
    throw new ProcessingError(
      `This file isn't a real ${FORMAT_LABELS[doc.format]} file, even though its name says so. Open it on your computer, save it again, and upload that.`,
    );
  }
  return data;
}

async function extract(doc: DocumentRow, data: Buffer, progress: Progress): Promise<Outcome> {
  switch (doc.format) {
    case "pdf":
      return extractPdf(doc, data, progress);
    case "docx":
      return extractDocx(doc, data, progress);
    case "pptx":
      return extractPptx(doc, data, progress);
    case "txt":
    case "md":
      return extractText(doc, data);
    default:
      if (isImageFormat(doc.format)) return extractImage(doc, data, progress);
      throw new ProcessingError("That file type isn't supported.");
  }
}

const page = (pageNumber: number, text: string, blocks: Block[] | null = null): ExtractedPage => ({
  pageNumber,
  text,
  blocks: blocks && blocks.length > 0 ? blocks : null,
  ocrUsed: false,
  ocrConfidence: null,
});

async function ocr(image: Buffer) {
  const result = await getOcr().recognise(image);
  return { text: normaliseText(result.text), confidence: Math.round(result.confidence) };
}

/**
 * Stage 4: pages whose text layer is missing or garbled are rendered and
 * read by OCR, up to the per-document limit (Architecture §10, tier 1).
 */
async function ocrPdfPages(pdfData: Buffer, pages: ExtractedPage[], progress: Progress, from: number, to: number) {
  if (!env().OCR_ENABLED) return;
  const candidates = pages.filter((p) => needsOcr(p.text)).slice(0, PROCESSING_LIMITS.maxOcrPages);
  if (candidates.length === 0) return;
  const pdf = await openPdf(pdfData);
  try {
    for (const [i, p] of candidates.entries()) {
      await progress("recognising", Math.round(from + ((to - from) * i) / candidates.length));
      const result = await ocr(await renderPdfPage(pdf, p.pageNumber));
      // Keep the text layer when OCR finds no more than it did.
      if (countCharacters(result.text) > countCharacters(p.text)) {
        p.text = result.text;
        p.blocks = null;
        p.ocrUsed = true;
        p.ocrConfidence = result.confidence;
      }
    }
  } finally {
    await closePdf(pdf);
  }
}

async function pdfPages(data: Buffer) {
  const pdf = await openPdf(data);
  try {
    return (await readPdfText(pdf)).map((text, i) => page(i + 1, text));
  } finally {
    await closePdf(pdf);
  }
}

async function extractPdf(doc: DocumentRow, data: Buffer, progress: Progress): Promise<Outcome> {
  await progress("extracting", 15);
  const pages = await pdfPages(data);
  await ocrPdfPages(data, pages, progress, 25, 90);
  return { pages, preview: "pdf", previewKey: doc.storageKey };
}

/** Stage 2: an Office file rendered to PDF for the viewer, or null when LibreOffice is unavailable or fails. */
async function renderOfficePdf(doc: DocumentRow, data: Buffer, extension: "docx" | "pptx", progress: Progress) {
  const binary = libreOfficePath(env().LIBREOFFICE_PATH);
  if (!binary) return null;
  await progress("converting", 15);
  try {
    const pdf = await convertToPdf(binary, data, extension);
    const key = derivedKey(doc.workspaceId, doc.id, "preview.pdf");
    await getStorage().put(key, pdf, MIME_TYPES.pdf);
    return { pdf, key };
  } catch (error) {
    logger.warn({ err: error, documentId: doc.id }, "office conversion failed; showing text only");
    return null;
  }
}

function assertOffice(data: Buffer, expected: "docx" | "pptx") {
  const { names } = readOfficeZip(data, () => false);
  if (officeKind(names) !== expected) {
    throw new ProcessingError(
      `This file isn't a real ${FORMAT_LABELS[expected]} file, even though its name says so. Open it on your computer, save it again, and upload that.`,
    );
  }
}

/**
 * Word: when a PDF rendering exists its pages are the pages the student sees,
 * so the text is taken page by page from it and lines up with the viewer.
 * Without one, the document is read structurally as a single page.
 */
async function extractDocx(doc: DocumentRow, data: Buffer, progress: Progress): Promise<Outcome> {
  assertOffice(data, "docx");
  const rendered = await renderOfficePdf(doc, data, "docx", progress);
  await progress("extracting", 50);
  if (rendered) {
    const pages = await pdfPages(rendered.pdf);
    return { pages, preview: "pdf", previewKey: rendered.key };
  }
  const blocks = await readDocx(data);
  return { pages: [page(1, blocksToText(blocks), blocks)], preview: "text", previewKey: null };
}

/** PowerPoint: one page per visible slide, with speaker notes; image-only slides are read by OCR. */
async function extractPptx(doc: DocumentRow, data: Buffer, progress: Progress): Promise<Outcome> {
  assertOffice(data, "pptx");
  const slides = readPptx(data);
  const rendered = await renderOfficePdf(doc, data, "pptx", progress);
  await progress("extracting", 50);
  const pages = slides.map((blocks, i) => page(i + 1, blocksToText(blocks.filter((b) => b.type !== "note")), blocks));
  if (rendered) {
    const pdf = await openPdf(rendered.pdf);
    const sameCount = pdf.numPages === slides.length;
    await closePdf(pdf);
    // OCR is only safe when the rendered pages line up one-to-one with the slides.
    if (sameCount) await ocrPdfPages(rendered.pdf, pages, progress, 55, 90);
  }
  // Notes stay in the page text after the slide's own text.
  for (const [i, p] of pages.entries()) {
    const notes = slides[i]!.filter((b) => b.type === "note").map((b) => b.text);
    if (notes.length > 0) p.text = [p.text, ...notes.map((n) => `Speaker notes: ${n}`)].filter(Boolean).join("\n\n");
  }
  return rendered ? { pages, preview: "pdf", previewKey: rendered.key } : { pages, preview: "text", previewKey: null };
}

async function extractText(doc: DocumentRow, data: Buffer): Promise<Outcome> {
  const source = decodeText(data);
  if (doc.format === "md") {
    const blocks = markdownBlocks(source);
    return { pages: [page(1, blocksToText(blocks), blocks)], preview: "text", previewKey: null };
  }
  return { pages: [page(1, normaliseText(source))], preview: "text", previewKey: null };
}

async function extractImage(doc: DocumentRow, data: Buffer, progress: Progress): Promise<Outcome> {
  await progress("converting", 15);
  const { webp, forOcr } = await normaliseImage(data);
  const key = derivedKey(doc.workspaceId, doc.id, "preview.webp");
  await getStorage().put(key, webp, MIME_TYPES.webp);
  const p = page(1, "");
  if (env().OCR_ENABLED) {
    await progress("recognising", 40);
    const result = await ocr(forOcr);
    Object.assign(p, { text: result.text, ocrUsed: true, ocrConfidence: result.confidence });
  }
  return { pages: [p], preview: "image", previewKey: key };
}
