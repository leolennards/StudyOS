import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { env } from "@/server/lib/env";
import { AppError, notFound } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { getDb, withTransaction } from "@/server/platform/db/client";
import { enqueue, QUEUES } from "@/server/platform/jobs";
import { documentPrefix, getStorage, originalKey } from "@/server/platform/storage";
import { logger } from "@/server/platform/observability/logger";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { formatFromFilename, MIME_TYPES } from "./domain/formats";
import { guessKind, titleFromFilename } from "./domain/kind";
import { libraryRepository as repo, type DocumentRow } from "./repository";
import type { createUploadSchema, documentIdSchema, setDocumentTopicsSchema, updateDocumentSchema } from "./schemas";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Library module: uploading, storing, processing and viewing documents
 * (Architecture §8, §9). Every function requires a RequestContext and only
 * touches its workspace; storage keys are only signed after that check.
 */

const MB = 1024 * 1024;

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

async function requireDocument(ctx: RequestContext, id: string) {
  const doc = await repo.findDocument(getDb(), ctx.workspaceId, id);
  if (!doc) throw notFound("That document");
  return doc;
}

/** The fields the UI needs; storage keys and checksums never leave the server. */
function toView(doc: DocumentRow) {
  return {
    id: doc.id,
    subjectId: doc.subjectId,
    title: doc.title,
    originalFilename: doc.originalFilename,
    kind: doc.kind,
    format: doc.format,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    stage: doc.stage,
    progress: doc.progress,
    errorMessage: doc.errorMessage,
    pageCount: doc.pageCount,
    ocrPageCount: doc.ocrPageCount,
    preview: doc.preview,
    createdAt: doc.createdAt,
    processedAt: doc.processedAt,
  };
}
export type DocumentView = ReturnType<typeof toView>;

const formatBytes = (bytes: number) =>
  bytes >= 1024 * MB ? `${(bytes / 1024 / MB).toFixed(1)} GB` : `${Math.ceil(bytes / MB)} MB`;

export const libraryService = {
  // ── reads ─────────────────────────────────────────────────────────────────
  /** A subject's documents, newest first, each with the topics it is linked to. */
  async listDocuments(ctx: RequestContext, subjectId: string) {
    const db = getDb();
    const topics = await knowledgeService.listTopics(ctx, subjectId);
    const docs = await repo.listForSubject(db, ctx.workspaceId, subjectId);
    const links = await repo.listTopicLinks(
      db,
      ctx.workspaceId,
      docs.map((d) => d.id),
    );
    const topicName = new Map(topics.map((t) => [t.id, t.name]));
    return docs.map((d) => ({
      ...toView(d),
      topics: links
        .filter((l) => l.documentId === d.id)
        .map((l) => ({ id: l.topicId, name: topicName.get(l.topicId) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  async getDocument(ctx: RequestContext, id: string) {
    const doc = await requireDocument(ctx, id);
    const links = await repo.listTopicLinks(getDb(), ctx.workspaceId, [doc.id]);
    return { ...toView(doc), topicIds: links.map((l) => l.topicId) };
  },

  /** The extracted text, page by page. */
  async getPages(ctx: RequestContext, id: string) {
    const doc = await requireDocument(ctx, id);
    const pages = await repo.listPages(getDb(), ctx.workspaceId, doc.id);
    return pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
      blocks: p.blocks,
      ocrUsed: p.ocrUsed,
      ocrConfidence: p.ocrConfidence,
    }));
  },

  /** Live status for the documents a page is waiting on. Unknown ids are left out. */
  async getStatuses(ctx: RequestContext, ids: string[]) {
    return repo.listStatuses(getDb(), ctx.workspaceId, ids);
  },

  async countDocuments(ctx: RequestContext, subjectId?: string) {
    return repo.countDocuments(getDb(), ctx.workspaceId, subjectId);
  },

  async storageUsage(ctx: RequestContext) {
    const e = env();
    return { usedBytes: await repo.storageUsed(getDb(), ctx.workspaceId), quotaBytes: e.STORAGE_QUOTA_MB * MB };
  },

  /** A short-lived URL for the viewer: the PDF (original or converted) or the re-encoded image. */
  async getViewUrl(ctx: RequestContext, id: string) {
    const doc = await requireDocument(ctx, id);
    if (doc.status !== "ready" || !doc.previewKey || (doc.preview !== "pdf" && doc.preview !== "image")) return null;
    return getStorage().createDownloadUrl(doc.previewKey, {
      contentType: doc.preview === "pdf" ? MIME_TYPES.pdf : MIME_TYPES.webp,
      disposition: "inline",
      filename: doc.originalFilename,
    });
  },

  /** A short-lived URL that downloads the file exactly as it was uploaded. */
  async getDownloadUrl(ctx: RequestContext, id: string) {
    const doc = await requireDocument(ctx, id);
    if (doc.status === "pending_upload") throw new AppError("VALIDATION", "That file hasn't finished uploading.");
    return getStorage().createDownloadUrl(doc.storageKey, {
      contentType: MIME_TYPES[doc.format],
      disposition: "attachment",
      filename: doc.originalFilename,
    });
  },

  // ── upload ────────────────────────────────────────────────────────────────
  /**
   * Step 1 of an upload (Architecture §8): validate the file's name, size and
   * the workspace's quota, record the document, and return a signed URL the
   * browser uploads to directly.
   */
  async createUpload(ctx: RequestContext, input: In<typeof createUploadSchema>) {
    assertCanWrite(ctx);
    const e = env();
    await knowledgeService.getSubject(ctx, input.subjectId);
    const declared = formatFromFilename(input.filename);
    if ("error" in declared) throw new AppError("VALIDATION", declared.error);
    const maxBytes = e.UPLOAD_MAX_MB * MB;
    if (input.size > maxBytes) {
      throw new AppError(
        "VALIDATION",
        `That file is ${formatBytes(input.size)}. The limit is ${e.UPLOAD_MAX_MB} MB per file.`,
      );
    }

    const db = getDb();
    const existing = await repo.findBySha256(db, ctx.workspaceId, input.sha256);
    if (existing) {
      if (existing.status === "pending_upload" || existing.status === "failed") {
        // An earlier attempt at the same file that never finished: start over.
        await this.deleteDocument(ctx, { id: existing.id });
      } else {
        const subject = await knowledgeService.getSubject(ctx, existing.subjectId);
        throw new AppError("CONFLICT", `You've already uploaded this file as "${existing.title}" in ${subject.name}.`);
      }
    }

    const used = await repo.storageUsed(db, ctx.workspaceId);
    const quota = e.STORAGE_QUOTA_MB * MB;
    if (used + input.size > quota) {
      throw new AppError(
        "VALIDATION",
        `This would go over your ${formatBytes(quota)} of storage (${formatBytes(used)} used). Delete documents you no longer need, then try again.`,
      );
    }

    const id = newId();
    const storageKey = originalKey(ctx.workspaceId, id);
    await repo.insertDocument(db, {
      id,
      workspaceId: ctx.workspaceId,
      subjectId: input.subjectId,
      title: titleFromFilename(input.filename),
      originalFilename: input.filename,
      kind: guessKind(input.filename),
      format: declared.format,
      sizeBytes: input.size,
      sha256: input.sha256,
      status: "pending_upload",
      storageKey,
    });
    const upload = await getStorage().createUploadUrl(storageKey, {
      contentType: MIME_TYPES[declared.format],
      contentLength: input.size,
      expiresInSeconds: 15 * 60,
    });
    return { id, upload };
  },

  /**
   * Step 2 of an upload: the browser says it has finished. The server checks
   * the object really is there at the agreed size, then queues processing in
   * the same transaction that marks the document uploaded.
   */
  async confirmUpload(ctx: RequestContext, input: In<typeof documentIdSchema>) {
    assertCanWrite(ctx);
    const doc = await requireDocument(ctx, input.id);
    if (doc.status !== "pending_upload") return { id: doc.id, status: doc.status };
    const head = await getStorage().head(doc.storageKey);
    if (!head) throw new AppError("VALIDATION", "The upload didn't arrive. Try uploading the file again.");
    if (head.size !== doc.sizeBytes) {
      await this.deleteDocument(ctx, { id: doc.id });
      throw new AppError("VALIDATION", "The upload was incomplete. Try uploading the file again.");
    }
    await withTransaction(async (tx, sql) => {
      await repo.updateDocument(tx, ctx.workspaceId, doc.id, {
        status: "uploaded",
        uploadedAt: new Date(),
        progress: 0,
      });
      await enqueue(sql, QUEUES.documentProcess, { documentId: doc.id, workspaceId: ctx.workspaceId });
    });
    return { id: doc.id, status: "uploaded" as const };
  },

  /** Queues a failed document for another attempt. */
  async retryProcessing(ctx: RequestContext, input: In<typeof documentIdSchema>) {
    assertCanWrite(ctx);
    const doc = await requireDocument(ctx, input.id);
    if (doc.status !== "failed") return { id: doc.id, status: doc.status };
    if (!(await getStorage().head(doc.storageKey))) {
      throw new AppError("VALIDATION", "The original file is missing. Delete this document and upload it again.");
    }
    await withTransaction(async (tx, sql) => {
      await repo.updateDocument(tx, ctx.workspaceId, doc.id, {
        status: "uploaded",
        stage: null,
        progress: 0,
        errorMessage: null,
      });
      await enqueue(sql, QUEUES.documentProcess, { documentId: doc.id, workspaceId: ctx.workspaceId });
    });
    return { id: doc.id, status: "uploaded" as const };
  },

  // ── edits ─────────────────────────────────────────────────────────────────
  async updateDocument(ctx: RequestContext, input: In<typeof updateDocumentSchema>) {
    assertCanWrite(ctx);
    const { id, ...patch } = input;
    if (Object.keys(patch).length === 0) return { id };
    const ok = await repo.updateDocument(getDb(), ctx.workspaceId, id, patch);
    if (!ok) throw notFound("That document");
    return { id };
  },

  /** Replaces the topics a document is linked to. Every topic must belong to the document's subject. */
  async setTopics(ctx: RequestContext, input: In<typeof setDocumentTopicsSchema>) {
    assertCanWrite(ctx);
    const doc = await requireDocument(ctx, input.id);
    const ids = [...new Set(input.topicIds)];
    const topics = await knowledgeService.findTopics(ctx, ids);
    if (topics.length !== ids.length || topics.some((t) => t.subjectId !== doc.subjectId)) {
      throw new AppError("VALIDATION", "Choose topics from this document's subject.");
    }
    await repo.replaceTopicLinks(getDb(), ctx.workspaceId, doc.id, ids);
    return { id: doc.id, topicIds: ids };
  },

  /** Deletes the document and its pages now, and its stored files through a job that retries. */
  async deleteDocument(ctx: RequestContext, input: In<typeof documentIdSchema>) {
    assertCanWrite(ctx);
    const doc = await requireDocument(ctx, input.id);
    await withTransaction(async (tx, sql) => {
      await repo.deleteDocument(tx, ctx.workspaceId, doc.id);
      await enqueue(sql, QUEUES.storageDelete, { prefix: documentPrefix(ctx.workspaceId, doc.id) });
    });
    logger.info({ documentId: doc.id }, "document deleted");
    return { id: doc.id, subjectId: doc.subjectId };
  },
};
