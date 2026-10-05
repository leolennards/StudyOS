import { and, asc, count, desc, eq, inArray, lt, sum } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import { documentPages, documents, documentTopics } from "@/server/platform/db/schema";

/**
 * All SQL for the library module. Every query a student's request can reach
 * is scoped by workspace id. The few `system*` queries below are for the
 * worker's housekeeping jobs only and are never called from a request.
 */
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
export type PageRow = typeof documentPages.$inferSelect;
export type PageInsert = Omit<typeof documentPages.$inferInsert, "workspaceId" | "documentId">;

const byId = (ws: string, id: string) => and(eq(documents.id, id), eq(documents.workspaceId, ws));

export const libraryRepository = {
  async insertDocument(db: DbExecutor, row: DocumentInsert) {
    await db.insert(documents).values(row);
  },

  async findDocument(db: DbExecutor, ws: string, id: string): Promise<DocumentRow | null> {
    const rows = await db.select().from(documents).where(byId(ws, id)).limit(1);
    return rows[0] ?? null;
  },

  async findBySha256(db: DbExecutor, ws: string, sha256: string): Promise<DocumentRow | null> {
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, ws), eq(documents.sha256, sha256)))
      .limit(1);
    return rows[0] ?? null;
  },

  listForSubject(db: DbExecutor, ws: string, subjectId: string) {
    return db
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, ws), eq(documents.subjectId, subjectId)))
      .orderBy(desc(documents.createdAt));
  },

  listStatuses(db: DbExecutor, ws: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return db
      .select({
        id: documents.id,
        status: documents.status,
        stage: documents.stage,
        progress: documents.progress,
        errorMessage: documents.errorMessage,
        pageCount: documents.pageCount,
      })
      .from(documents)
      .where(and(eq(documents.workspaceId, ws), inArray(documents.id, ids)));
  },

  async updateDocument(db: DbExecutor, ws: string, id: string, patch: Partial<DocumentInsert>) {
    const rows = await db
      .update(documents)
      .set({ ...patch, updatedAt: new Date() })
      .where(byId(ws, id))
      .returning({ id: documents.id });
    return rows.length > 0;
  },

  async deleteDocument(db: DbExecutor, ws: string, id: string) {
    const rows = await db.delete(documents).where(byId(ws, id)).returning({ id: documents.id });
    return rows.length > 0;
  },

  async storageUsed(db: DbExecutor, ws: string) {
    const [row] = await db
      .select({ bytes: sum(documents.sizeBytes).mapWith(Number) })
      .from(documents)
      .where(eq(documents.workspaceId, ws));
    return row?.bytes ?? 0;
  },

  async countDocuments(db: DbExecutor, ws: string, subjectId?: string) {
    const [row] = await db
      .select({ n: count() })
      .from(documents)
      .where(and(eq(documents.workspaceId, ws), subjectId ? eq(documents.subjectId, subjectId) : undefined));
    return row?.n ?? 0;
  },

  // ── pages ─────────────────────────────────────────────────────────────────
  async replacePages(db: DbExecutor, ws: string, documentId: string, pages: PageInsert[]) {
    await db
      .delete(documentPages)
      .where(and(eq(documentPages.workspaceId, ws), eq(documentPages.documentId, documentId)));
    for (let i = 0; i < pages.length; i += 500) {
      await db
        .insert(documentPages)
        .values(pages.slice(i, i + 500).map((p) => ({ ...p, workspaceId: ws, documentId })));
    }
  },

  listPages(db: DbExecutor, ws: string, documentId: string) {
    return db
      .select()
      .from(documentPages)
      .where(and(eq(documentPages.workspaceId, ws), eq(documentPages.documentId, documentId)))
      .orderBy(asc(documentPages.pageNumber));
  },

  // ── topics ────────────────────────────────────────────────────────────────
  listTopicLinks(db: DbExecutor, ws: string, documentIds: string[]) {
    if (documentIds.length === 0) return Promise.resolve([]);
    return db
      .select({ documentId: documentTopics.documentId, topicId: documentTopics.topicId })
      .from(documentTopics)
      .where(and(eq(documentTopics.workspaceId, ws), inArray(documentTopics.documentId, documentIds)));
  },

  async replaceTopicLinks(db: DbExecutor, ws: string, documentId: string, topicIds: string[]) {
    await db
      .delete(documentTopics)
      .where(and(eq(documentTopics.workspaceId, ws), eq(documentTopics.documentId, documentId)));
    if (topicIds.length > 0) {
      await db.insert(documentTopics).values(topicIds.map((topicId) => ({ workspaceId: ws, documentId, topicId })));
    }
  },

  // ── housekeeping (worker only, across workspaces) ─────────────────────────
  /** Which of these (workspace, document) pairs still exist. */
  async systemExistingDocuments(db: DbExecutor, ids: string[]) {
    if (ids.length === 0) return new Set<string>();
    const rows = await db
      .select({ id: documents.id, workspaceId: documents.workspaceId })
      .from(documents)
      .where(inArray(documents.id, ids));
    return new Set(rows.map((r) => `${r.workspaceId}/${r.id}`));
  },

  /** Uploads that were started but never confirmed. */
  systemAbandonedUploads(db: DbExecutor, olderThan: Date) {
    return db
      .select({ id: documents.id, workspaceId: documents.workspaceId })
      .from(documents)
      .where(and(eq(documents.status, "pending_upload"), lt(documents.createdAt, olderThan)))
      .limit(500);
  },

  async systemDeleteDocument(db: DbExecutor, ws: string, id: string) {
    await db.delete(documents).where(byId(ws, id));
  },
};
