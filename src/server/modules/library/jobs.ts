import { getDb } from "@/server/platform/db/client";
import { type Job, type JobPayloads, QUEUE_OPTIONS, QUEUES } from "@/server/platform/jobs";
import { logger } from "@/server/platform/observability/logger";
import { documentPrefix, getStorage, parseDocumentKey } from "@/server/platform/storage";
import { processDocument } from "./pipeline";
import { libraryRepository as repo } from "./repository";

/**
 * The library module's job handlers, registered by the worker
 * (src/worker/index.ts). Handlers derive everything from the job payload and
 * the database row; nothing is trusted from the browser.
 */
const DOCUMENT_PREFIX_RE =
  /^ws\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/docs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/;

/** An upload that has not been confirmed after this long is abandoned. */
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export const libraryJobs = {
  async processDocument(job: Job<JobPayloads["document-process"]>) {
    return processDocument(job.data, {
      retryCount: job.retryCount,
      retryLimit: QUEUE_OPTIONS[QUEUES.documentProcess].retryLimit ?? 0,
    });
  },

  async deleteStorage(job: Job<JobPayloads["storage-delete"]>) {
    const { prefix } = job.data;
    if (!DOCUMENT_PREFIX_RE.test(prefix)) {
      logger.error({ prefix }, "refusing to delete outside a document prefix");
      return;
    }
    const removed = await getStorage().deletePrefix(prefix);
    logger.info({ prefix, removed }, "stored files deleted");
  },

  /**
   * Hourly housekeeping (Architecture §8, lifecycle): removes uploads that
   * were never confirmed, and stored files whose document no longer exists
   * (for example after a subject or an account was deleted, which removes
   * the rows through cascades).
   */
  async reconcileStorage() {
    const db = getDb();
    const storage = getStorage();
    let abandoned = 0;
    for (const row of await repo.systemAbandonedUploads(db, new Date(Date.now() - ABANDONED_AFTER_MS))) {
      await repo.systemDeleteDocument(db, row.workspaceId, row.id);
      await storage.deletePrefix(documentPrefix(row.workspaceId, row.id));
      abandoned += 1;
    }

    const byDocument = new Map<string, { workspaceId: string; documentId: string }>();
    for (const key of await storage.list("ws/")) {
      const parsed = parseDocumentKey(key);
      if (parsed) byDocument.set(`${parsed.workspaceId}/${parsed.documentId}`, parsed);
    }
    const candidates = [...byDocument.values()];
    let orphaned = 0;
    for (let i = 0; i < candidates.length; i += 500) {
      const batch = candidates.slice(i, i + 500);
      const existing = await repo.systemExistingDocuments(
        db,
        batch.map((c) => c.documentId),
      );
      for (const c of batch) {
        if (existing.has(`${c.workspaceId}/${c.documentId}`)) continue;
        await storage.deletePrefix(documentPrefix(c.workspaceId, c.documentId));
        orphaned += 1;
      }
    }
    logger.info({ abandoned, orphaned }, "storage reconciled");
    return { abandoned, orphaned };
  },
};
