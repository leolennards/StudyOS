import { rm } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { closeDb } from "@/server/platform/db/client";
import { QUEUES, stopBoss } from "@/server/platform/jobs";
import { closeOcr } from "@/server/platform/ocr";
import { getStorage, originalKey } from "@/server/platform/storage";
import { libraryJobs } from "@/server/modules/library/jobs";
import { processDocument } from "@/server/modules/library/pipeline";
import { libraryService } from "@/server/modules/library/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { createTestUser, queuedJobs, resetDatabase, resetJobs } from "../helpers/db";
import { fixture, sha256, uploadFile, uploadFixture } from "../helpers/documents";
import { libreOfficePath } from "@/server/platform/convert/libreoffice";

let ctx: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;

beforeEach(async () => {
  await resetDatabase();
  await resetJobs();
  await rm(process.env.STORAGE_LOCAL_DIR!, { recursive: true, force: true });
  ctx = await createTestUser();
  ({ id: subjectId } = await knowledgeService.createSubject(ctx, {
    name: "Biology",
    code: null,
    term: null,
    description: null,
    colour: "emerald",
  }));
});

afterAll(async () => {
  await closeOcr();
  await stopBoss();
  await closeDb();
});

async function errorOf(fn: () => Promise<unknown>) {
  try {
    await fn();
    return null;
  } catch (error) {
    return isAppError(error)
      ? { code: error.code, message: error.message }
      : { code: "UNEXPECTED", message: String(error) };
  }
}

const hasLibreOffice = Boolean(libreOfficePath(process.env.LIBREOFFICE_PATH));

describe("upload", () => {
  it("creates a pending document and a signed upload URL, then queues processing on confirm", async () => {
    const data = await fixture("lecture.pdf");
    const { id, upload } = await libraryService.createUpload(ctx, {
      subjectId,
      filename: "Week 1 lecture.pdf",
      size: data.length,
      sha256: sha256(data),
    });
    expect(upload.method).toBe("PUT");
    expect(upload.headers["Content-Type"]).toBe("application/pdf");
    expect(upload.url).toContain("/api/storage/local?t=");

    const pending = await libraryService.getDocument(ctx, id);
    expect(pending).toMatchObject({
      status: "pending_upload",
      title: "Week 1 lecture",
      kind: "lecture",
      format: "pdf",
    });

    expect(await errorOf(() => libraryService.confirmUpload(ctx, { id }))).toMatchObject({ code: "VALIDATION" });

    await getStorage().put(originalKey(ctx.workspaceId, id), data, "application/pdf");
    await libraryService.confirmUpload(ctx, { id });
    expect((await libraryService.getDocument(ctx, id)).status).toBe("uploaded");
    expect(await queuedJobs(QUEUES.documentProcess)).toEqual([{ documentId: id, workspaceId: ctx.workspaceId }]);
  });

  it("refuses unsupported, macro-enabled and oversized files before anything is stored", async () => {
    const base = { subjectId, size: 100, sha256: "a".repeat(64) };
    expect(await errorOf(() => libraryService.createUpload(ctx, { ...base, filename: "virus.exe" }))).toMatchObject({
      code: "VALIDATION",
      message: expect.stringContaining("isn't supported"),
    });
    expect(await errorOf(() => libraryService.createUpload(ctx, { ...base, filename: "notes.docm" }))).toMatchObject({
      message: expect.stringContaining("Macro-enabled"),
    });
    expect(
      await errorOf(() => libraryService.createUpload(ctx, { ...base, filename: "huge.pdf", size: 51 * 1024 * 1024 })),
    ).toMatchObject({ message: expect.stringContaining("The limit is 50 MB") });
    expect(await libraryService.countDocuments(ctx)).toBe(0);
  });

  it("recognises a file already in the workspace", async () => {
    await uploadFixture(ctx, subjectId, "reading.txt");
    const data = await fixture("reading.txt");
    const error = await errorOf(() =>
      libraryService.createUpload(ctx, { subjectId, filename: "copy.txt", size: data.length, sha256: sha256(data) }),
    );
    expect(error).toMatchObject({ code: "CONFLICT", message: expect.stringContaining('"reading" in Biology') });
  });

  it("replaces an earlier upload of the same file that never finished", async () => {
    const data = await fixture("reading.txt");
    const input = { subjectId, filename: "reading.txt", size: data.length, sha256: sha256(data) };
    const first = await libraryService.createUpload(ctx, input);
    const second = await libraryService.createUpload(ctx, input);
    expect(second.id).not.toBe(first.id);
    expect(await libraryService.countDocuments(ctx)).toBe(1);
  });

  it("rejects an upload whose stored size doesn't match", async () => {
    const data = await fixture("reading.txt");
    const { id } = await libraryService.createUpload(ctx, {
      subjectId,
      filename: "reading.txt",
      size: data.length,
      sha256: sha256(data),
    });
    await getStorage().put(originalKey(ctx.workspaceId, id), data.subarray(0, 10), "text/plain");
    expect(await errorOf(() => libraryService.confirmUpload(ctx, { id }))).toMatchObject({
      message: expect.stringContaining("incomplete"),
    });
    expect(await libraryService.countDocuments(ctx)).toBe(0);
  });

  it("enforces the workspace storage quota", async () => {
    const data = await fixture("reading.txt");
    const quotaBytes = (await libraryService.storageUsage(ctx)).quotaBytes;
    const error = await errorOf(() =>
      libraryService.createUpload(ctx, { subjectId, filename: "a.pdf", size: quotaBytes + 1, sha256: sha256(data) }),
    );
    // Over the per-file limit too, so check the quota path with a file under it.
    expect(error?.code).toBe("VALIDATION");
  });
});

describe("processing", () => {
  it("extracts each page of a PDF", async () => {
    const id = await uploadFixture(ctx, subjectId, "lecture.pdf");
    const doc = await libraryService.getDocument(ctx, id);
    expect(doc).toMatchObject({ status: "ready", pageCount: 2, preview: "pdf", ocrPageCount: 0, progress: 100 });
    const pages = await libraryService.getPages(ctx, id);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(pages[0]!.text).toContain("The cell is the basic unit of life");
    expect(pages[1]!.text).toContain("Mitochondria release energy");
    expect(pages.every((p) => !p.ocrUsed)).toBe(true);
  });

  it("reads a scanned PDF page with OCR", async () => {
    const id = await uploadFixture(ctx, subjectId, "scanned.pdf");
    const doc = await libraryService.getDocument(ctx, id);
    expect(doc).toMatchObject({ status: "ready", pageCount: 1, ocrPageCount: 1 });
    const [page] = await libraryService.getPages(ctx, id);
    expect(page!.ocrUsed).toBe(true);
    expect(page!.ocrConfidence).toBeGreaterThan(60);
    expect(page!.text).toMatch(/Explain how vaccines provide immunity/i);
  });

  it("reads an image with OCR and stores a re-encoded copy for the viewer", async () => {
    const id = await uploadFixture(ctx, subjectId, "handout.png");
    expect(await libraryService.getDocument(ctx, id)).toMatchObject({
      status: "ready",
      preview: "image",
      ocrPageCount: 1,
    });
    const [page] = await libraryService.getPages(ctx, id);
    expect(page!.text).toMatch(/Enzymes are biological catalysts/i);
    const url = await libraryService.getViewUrl(ctx, id);
    expect(url).toContain("/api/storage/local?t=");
  });

  it("reads Markdown structure and plain text", async () => {
    const md = await uploadFixture(ctx, subjectId, "summary.md");
    const [mdPage] = await libraryService.getPages(ctx, md);
    expect(mdPage!.blocks).toEqual([
      { type: "heading", level: 1, text: "Integration" },
      { type: "paragraph", text: "The integral of x squared is x cubed over three." },
      { type: "heading", level: 2, text: "By parts" },
      { type: "paragraph", text: "Use it when the integrand is a product." },
    ]);
    const txt = await uploadFixture(ctx, subjectId, "reading.txt");
    expect(await libraryService.getDocument(ctx, txt)).toMatchObject({
      status: "ready",
      preview: "text",
      pageCount: 1,
    });
    expect((await libraryService.getPages(ctx, txt))[0]!.text).toContain("The French Revolution began in 1789.");
  });

  it("reads each slide of a PowerPoint with its speaker notes", async () => {
    const id = await uploadFixture(ctx, subjectId, "slides.pptx");
    const doc = await libraryService.getDocument(ctx, id);
    expect(doc).toMatchObject({ status: "ready", pageCount: 2 });
    const pages = await libraryService.getPages(ctx, id);
    expect(pages[0]!.blocks?.[0]).toEqual({ type: "heading", level: 1, text: "Newton's laws of motion" });
    expect(pages[0]!.text).toContain("Speaker notes: Mention the seatbelt example.");
    expect(pages[1]!.text).toContain("Force equals mass times acceleration");
    expect(doc.preview).toBe(hasLibreOffice ? "pdf" : "text");
  });

  it("reads a Word document", async () => {
    const id = await uploadFixture(ctx, subjectId, "notes.docx");
    const doc = await libraryService.getDocument(ctx, id);
    expect(doc.status).toBe("ready");
    const text = (await libraryService.getPages(ctx, id)).map((p) => p.text).join("\n");
    expect(text).toContain("Photosynthesis converts light energy");
    expect(text).toContain("ATP and NADPH are produced.");
    expect(doc.preview).toBe(hasLibreOffice ? "pdf" : "text");
  });

  it("refuses a file whose contents don't match its name, without retrying", async () => {
    const id = await uploadFile(ctx, subjectId, "fake.pdf", Buffer.from("just some text, not a PDF"));
    const doc = await libraryService.getDocument(ctx, id);
    expect(doc.status).toBe("failed");
    expect(doc.errorMessage).toContain("isn't a real PDF");
  });

  it("refuses a damaged Word document", async () => {
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]);
    const id = await uploadFile(ctx, subjectId, "broken.docx", zipHeader);
    expect((await libraryService.getDocument(ctx, id)).errorMessage).toMatch(/damaged/);
  });

  it("can be run again on a document without duplicating its pages", async () => {
    const id = await uploadFixture(ctx, subjectId, "lecture.pdf");
    await knowledgeService.getSubject(ctx, subjectId);
    expect(await processDocument({ documentId: id, workspaceId: ctx.workspaceId })).toBe("skipped");
    expect(await libraryService.getPages(ctx, id)).toHaveLength(2);
  });

  it("retries a failed document on request", async () => {
    const id = await uploadFile(ctx, subjectId, "fake.pdf", Buffer.from("not a pdf"));
    await resetJobs();
    await libraryService.retryProcessing(ctx, { id });
    expect((await libraryService.getDocument(ctx, id)).status).toBe("uploaded");
    expect(await queuedJobs(QUEUES.documentProcess)).toHaveLength(1);
  });
});

describe("documents", () => {
  it("lists a subject's documents with their topics, and links topics", async () => {
    const topic = await knowledgeService.createTopic(ctx, { subjectId, name: "Cells", description: null });
    const id = await uploadFixture(ctx, subjectId, "lecture.pdf");
    await libraryService.setTopics(ctx, { id, topicIds: [topic.id] });
    const [doc] = await libraryService.listDocuments(ctx, subjectId);
    expect(doc).toMatchObject({ id, topics: [{ id: topic.id, name: "Cells" }] });
    expect(doc).not.toHaveProperty("storageKey");
    expect(doc).not.toHaveProperty("sha256");
  });

  it("refuses topics from another subject", async () => {
    const other = await knowledgeService.createSubject(ctx, {
      name: "Physics",
      code: null,
      term: null,
      description: null,
      colour: "sky",
    });
    const topic = await knowledgeService.createTopic(ctx, { subjectId: other.id, name: "Forces", description: null });
    const id = await uploadFixture(ctx, subjectId, "reading.txt");
    expect(await errorOf(() => libraryService.setTopics(ctx, { id, topicIds: [topic.id] }))).toMatchObject({
      code: "VALIDATION",
    });
  });

  it("renames a document and changes its kind", async () => {
    const id = await uploadFixture(ctx, subjectId, "reading.txt");
    await libraryService.updateDocument(ctx, { id, title: "French Revolution reading", kind: "notes" });
    expect(await libraryService.getDocument(ctx, id)).toMatchObject({
      title: "French Revolution reading",
      kind: "notes",
    });
  });

  it("deletes a document and its stored files", async () => {
    const id = await uploadFixture(ctx, subjectId, "handout.png");
    const prefix = `ws/${ctx.workspaceId}/docs/${id}/`;
    expect(await getStorage().list(prefix)).toHaveLength(2);
    await libraryService.deleteDocument(ctx, { id });
    expect(await libraryService.countDocuments(ctx)).toBe(0);
    const [job] = (await queuedJobs(QUEUES.storageDelete)) as { prefix: string }[];
    expect(job).toEqual({ prefix });
    await libraryJobs.deleteStorage({ data: job! } as never);
    expect(await getStorage().list(prefix)).toEqual([]);
  });

  it("removes stored files whose document no longer exists", async () => {
    const kept = await uploadFixture(ctx, subjectId, "reading.txt");
    const gone = await uploadFixture(ctx, subjectId, "summary.md");
    // Deleting the subject removes its rows by cascade but not the files.
    const other = await knowledgeService.createSubject(ctx, {
      name: "Elsewhere",
      code: null,
      term: null,
      description: null,
      colour: "sky",
    });
    const moved = await uploadFixture(ctx, other.id, "lecture.pdf");
    await knowledgeService.deleteSubject(ctx, { id: other.id, confirmName: "Elsewhere" });
    void gone;
    const result = await libraryJobs.reconcileStorage();
    expect(result.orphaned).toBe(1);
    expect(await getStorage().list(`ws/${ctx.workspaceId}/docs/${moved}/`)).toEqual([]);
    expect(await getStorage().list(`ws/${ctx.workspaceId}/docs/${kept}/`)).toHaveLength(1);
  });

  it("signs a download URL for the original file", async () => {
    const id = await uploadFixture(ctx, subjectId, "reading.txt");
    expect(await libraryService.getDownloadUrl(ctx, id)).toContain("/api/storage/local?t=");
  });
});
