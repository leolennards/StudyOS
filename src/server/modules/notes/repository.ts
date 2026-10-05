import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import { notes, noteTopics } from "@/server/platform/db/schema";
import { HEADLINE_OPTIONS } from "@/server/lib/search-query";

/**
 * All SQL for the notes module. Every query a student's request can reach is
 * scoped by workspace id. The `system*` query is for the worker's trash
 * clean-up only and is never called from a request.
 */
export type NoteRow = typeof notes.$inferSelect;
export type NoteInsert = typeof notes.$inferInsert;

const byId = (ws: string, id: string) => and(eq(notes.id, id), eq(notes.workspaceId, ws));

/** Every column except the generated search vector, which the app never reads. */
const noteColumns = {
  id: notes.id,
  workspaceId: notes.workspaceId,
  subjectId: notes.subjectId,
  sectionId: notes.sectionId,
  title: notes.title,
  content: notes.content,
  contentText: notes.contentText,
  wordCount: notes.wordCount,
  origin: notes.origin,
  revision: notes.revision,
  deletedAt: notes.deletedAt,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

/** What a list shows: no content, only the start of the text. */
const summaryColumns = {
  id: notes.id,
  subjectId: notes.subjectId,
  sectionId: notes.sectionId,
  title: notes.title,
  preview: sql<string>`left(${notes.contentText}, 400)`,
  wordCount: notes.wordCount,
  deletedAt: notes.deletedAt,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

export const notesRepository = {
  async insertNote(db: DbExecutor, row: NoteInsert) {
    await db.insert(notes).values(row);
  },

  async findNote(db: DbExecutor, ws: string, id: string) {
    const rows = await db.select(noteColumns).from(notes).where(byId(ws, id)).limit(1);
    return rows[0] ?? null;
  },

  /** A subject's notes, most recently edited first; trashed notes when `trashed` is set. */
  listForSubject(db: DbExecutor, ws: string, subjectId: string, opts: { trashed: boolean }) {
    return db
      .select(summaryColumns)
      .from(notes)
      .where(
        and(
          eq(notes.workspaceId, ws),
          eq(notes.subjectId, subjectId),
          opts.trashed ? isNotNull(notes.deletedAt) : isNull(notes.deletedAt),
        ),
      )
      .orderBy(opts.trashed ? desc(notes.deletedAt) : desc(notes.updatedAt));
  },

  async countNotes(db: DbExecutor, ws: string, subjectId?: string) {
    const [row] = await db
      .select({ n: count() })
      .from(notes)
      .where(
        and(eq(notes.workspaceId, ws), isNull(notes.deletedAt), subjectId ? eq(notes.subjectId, subjectId) : undefined),
      );
    return row?.n ?? 0;
  },

  /**
   * Saves new content only if nobody else saved since `revision` was read.
   * Returns the new revision, or null when the note has moved on (or is gone).
   */
  async saveContent(
    db: DbExecutor,
    ws: string,
    id: string,
    revision: number,
    patch: Pick<NoteInsert, "title" | "content" | "contentText" | "wordCount">,
  ) {
    const rows = await db
      .update(notes)
      .set({ ...patch, revision: sql`${notes.revision} + 1`, updatedAt: new Date() })
      .where(and(byId(ws, id), eq(notes.revision, revision), isNull(notes.deletedAt)))
      .returning({ revision: notes.revision, updatedAt: notes.updatedAt });
    return rows[0] ?? null;
  },

  async updateNote(
    db: DbExecutor,
    ws: string,
    id: string,
    patch: Partial<Pick<NoteInsert, "sectionId" | "deletedAt">>,
    opts: { touch?: boolean } = {},
  ) {
    const rows = await db
      .update(notes)
      .set(opts.touch === false ? patch : { ...patch, updatedAt: new Date() })
      .where(byId(ws, id))
      .returning({ id: notes.id });
    return rows.length > 0;
  },

  async deleteNote(db: DbExecutor, ws: string, id: string) {
    const rows = await db.delete(notes).where(byId(ws, id)).returning({ id: notes.id });
    return rows.length > 0;
  },

  async deleteTrashed(db: DbExecutor, ws: string, subjectId: string) {
    const rows = await db
      .delete(notes)
      .where(and(eq(notes.workspaceId, ws), eq(notes.subjectId, subjectId), isNotNull(notes.deletedAt)))
      .returning({ id: notes.id });
    return rows.length;
  },

  // ── topics ────────────────────────────────────────────────────────────────
  listTopicLinks(db: DbExecutor, ws: string, noteIds: string[]) {
    if (noteIds.length === 0) return Promise.resolve([]);
    return db
      .select({ noteId: noteTopics.noteId, topicId: noteTopics.topicId })
      .from(noteTopics)
      .where(and(eq(noteTopics.workspaceId, ws), inArray(noteTopics.noteId, noteIds)))
      .orderBy(asc(noteTopics.createdAt));
  },

  async replaceTopicLinks(db: DbExecutor, ws: string, noteId: string, topicIds: string[]) {
    await db.delete(noteTopics).where(and(eq(noteTopics.workspaceId, ws), eq(noteTopics.noteId, noteId)));
    if (topicIds.length > 0) {
      await db.insert(noteTopics).values(topicIds.map((topicId) => ({ workspaceId: ws, noteId, topicId })));
    }
  },

  // ── search ────────────────────────────────────────────────────────────────
  /**
   * Notes matching a query, best first (Architecture §31): full-text matches
   * on the title and text, plus titles that contain the typed words or are a
   * close (typo-tolerant) match. Trashed notes are never returned.
   */
  async search(
    db: DbExecutor,
    ws: string,
    q: { tsquery: string | null; text: string; like: string; subjectId?: string; limit: number },
  ) {
    const tsq = q.tsquery ? sql`to_tsquery('english', ${q.tsquery})` : null;
    const fts = tsq ? sql`${notes.searchVector} @@ ${tsq}` : sql`false`;
    const rank = tsq ? sql`ts_rank_cd(${notes.searchVector}, ${tsq})` : sql`0`;
    const subject = q.subjectId ? sql`and ${notes.subjectId} = ${q.subjectId}` : sql``;
    const headline = tsq
      ? sql`ts_headline('english', m.content_text, ${tsq}, ${HEADLINE_OPTIONS})`
      : sql`left(m.content_text, 200)`;
    const result = await db.execute(sql`
      select m.id, m.subject_id, m.title, m.updated_at, ${headline} as headline
      from (
        select ${notes.id} as id, ${notes.subjectId} as subject_id, ${notes.title} as title,
               ${notes.contentText} as content_text, ${notes.updatedAt} as updated_at,
               ${rank}
                 + case when ${notes.title} ilike ${q.like} then 1 else 0 end
                 + word_similarity(${q.text}, ${notes.title}) as score
        from ${notes}
        where ${notes.workspaceId} = ${ws} and ${notes.deletedAt} is null ${subject}
          and (${fts} or ${notes.title} ilike ${q.like} or word_similarity(${q.text}, ${notes.title}) >= 0.5)
        order by score desc, ${notes.updatedAt} desc
        limit ${q.limit}
      ) m
      order by m.score desc, m.updated_at desc
    `);
    return (result.rows as { id: string; subject_id: string; title: string; headline: string }[]).map((r) => ({
      id: r.id,
      subjectId: r.subject_id,
      title: r.title,
      headline: r.headline,
    }));
  },

  // ── housekeeping (worker only, across workspaces) ─────────────────────────
  async systemPurgeTrash(db: DbExecutor, trashedBefore: Date) {
    const rows = await db
      .delete(notes)
      .where(and(isNotNull(notes.deletedAt), lt(notes.deletedAt, trashedBefore)))
      .returning({ id: notes.id });
    return rows.length;
  },
};
