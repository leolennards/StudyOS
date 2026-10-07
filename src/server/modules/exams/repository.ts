import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import {
  pastPaperAttemptMarks,
  pastPaperAttempts,
  pastPaperQuestions,
  pastPaperQuestionTopics,
  pastPapers,
} from "@/server/platform/db/schema";

/**
 * All SQL for past papers (Architecture §22). Every query is scoped by
 * workspace id, and the composite foreign keys keep a paper, its questions,
 * their topics and the attempts at it inside one workspace.
 */
export type PaperRow = typeof pastPapers.$inferSelect;
export type PaperInsert = typeof pastPapers.$inferInsert;

const paperById = (ws: string, id: string) => and(eq(pastPapers.workspaceId, ws), eq(pastPapers.id, id));

export const examsRepository = {
  // ── papers ────────────────────────────────────────────────────────────────
  async insertPaper(db: DbExecutor, row: PaperInsert) {
    await db.insert(pastPapers).values(row);
  },

  async updatePaper(db: DbExecutor, ws: string, id: string, patch: Partial<PaperInsert>) {
    const rows = await db
      .update(pastPapers)
      .set({ ...patch, updatedAt: new Date() })
      .where(paperById(ws, id))
      .returning({ id: pastPapers.id });
    return rows.length > 0;
  },

  async deletePaper(db: DbExecutor, ws: string, id: string) {
    const rows = await db.delete(pastPapers).where(paperById(ws, id)).returning({ id: pastPapers.id });
    return rows.length > 0;
  },

  async findPaper(db: DbExecutor, ws: string, id: string) {
    const rows = await db.select().from(pastPapers).where(paperById(ws, id)).limit(1);
    return rows[0] ?? null;
  },

  /** A subject's papers, newest year first, then by name. */
  async listPapers(db: DbExecutor, ws: string, subjectId: string) {
    const rows = await db
      .select()
      .from(pastPapers)
      .where(and(eq(pastPapers.workspaceId, ws), eq(pastPapers.subjectId, subjectId)));
    return rows.sort(
      (a, b) =>
        (b.year ?? 0) - (a.year ?? 0) ||
        a.title.localeCompare(b.title, undefined, { numeric: true }) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  },

  // ── questions ─────────────────────────────────────────────────────────────
  /** The questions on these papers, in order, each with the topics it tests. */
  async listQuestions(db: DbExecutor, ws: string, paperIds: string[]) {
    if (paperIds.length === 0) return [];
    const [questions, links] = await Promise.all([
      db
        .select({
          id: pastPaperQuestions.id,
          paperId: pastPaperQuestions.paperId,
          number: pastPaperQuestions.number,
          marks: pastPaperQuestions.marks,
        })
        .from(pastPaperQuestions)
        .where(and(eq(pastPaperQuestions.workspaceId, ws), inArray(pastPaperQuestions.paperId, paperIds)))
        .orderBy(asc(pastPaperQuestions.paperId), asc(pastPaperQuestions.position)),
      db
        .select({ questionId: pastPaperQuestionTopics.questionId, topicId: pastPaperQuestionTopics.topicId })
        .from(pastPaperQuestionTopics)
        .innerJoin(
          pastPaperQuestions,
          and(
            eq(pastPaperQuestions.workspaceId, pastPaperQuestionTopics.workspaceId),
            eq(pastPaperQuestions.id, pastPaperQuestionTopics.questionId),
          ),
        )
        .where(and(eq(pastPaperQuestionTopics.workspaceId, ws), inArray(pastPaperQuestions.paperId, paperIds))),
    ]);
    const topicsOf = new Map<string, string[]>();
    for (const l of links) topicsOf.set(l.questionId, [...(topicsOf.get(l.questionId) ?? []), l.topicId]);
    return questions.map((q) => ({ ...q, topicIds: topicsOf.get(q.id) ?? [] }));
  },

  /**
   * Replaces a paper's questions: updates the ones kept, inserts the new
   * ones, deletes the rest (and the marks logged against them), and
   * rewrites their topic links. Run inside a transaction.
   */
  async replaceQuestions(
    db: DbExecutor,
    ws: string,
    paperId: string,
    questions: { id: string; number: string; marks: number; topicIds: string[]; isNew: boolean }[],
  ) {
    const kept = questions.filter((q) => !q.isNew).map((q) => q.id);
    await db
      .delete(pastPaperQuestions)
      .where(
        and(
          eq(pastPaperQuestions.workspaceId, ws),
          eq(pastPaperQuestions.paperId, paperId),
          ...(kept.length > 0 ? [notInArray(pastPaperQuestions.id, kept)] : []),
        ),
      );
    for (const [position, q] of questions.entries()) {
      if (q.isNew) continue;
      await db
        .update(pastPaperQuestions)
        .set({ number: q.number, marks: q.marks, position })
        .where(
          and(
            eq(pastPaperQuestions.workspaceId, ws),
            eq(pastPaperQuestions.paperId, paperId),
            eq(pastPaperQuestions.id, q.id),
          ),
        );
    }
    const added = [...questions.entries()].filter(([, q]) => q.isNew);
    if (added.length > 0) {
      await db.insert(pastPaperQuestions).values(
        added.map(([position, q]) => ({
          id: q.id,
          workspaceId: ws,
          paperId,
          number: q.number,
          marks: q.marks,
          position,
        })),
      );
    }
    if (kept.length > 0) {
      await db
        .delete(pastPaperQuestionTopics)
        .where(and(eq(pastPaperQuestionTopics.workspaceId, ws), inArray(pastPaperQuestionTopics.questionId, kept)));
    }
    const links = questions.flatMap((q) =>
      [...new Set(q.topicIds)].map((topicId) => ({ workspaceId: ws, questionId: q.id, topicId })),
    );
    if (links.length > 0) await db.insert(pastPaperQuestionTopics).values(links);
  },

  // ── attempts ──────────────────────────────────────────────────────────────
  /** Attempts at these papers, oldest first. */
  listAttempts(db: DbExecutor, ws: string, paperIds: string[]) {
    if (paperIds.length === 0) return Promise.resolve([]);
    return db
      .select({
        id: pastPaperAttempts.id,
        paperId: pastPaperAttempts.paperId,
        takenOn: pastPaperAttempts.takenOn,
        minutes: pastPaperAttempts.minutes,
        score: pastPaperAttempts.score,
        outOf: pastPaperAttempts.outOf,
      })
      .from(pastPaperAttempts)
      .where(and(eq(pastPaperAttempts.workspaceId, ws), inArray(pastPaperAttempts.paperId, paperIds)))
      .orderBy(asc(pastPaperAttempts.takenOn), asc(pastPaperAttempts.createdAt));
  },

  /** The marks per question in these attempts. */
  listAttemptMarks(db: DbExecutor, ws: string, attemptIds: string[]) {
    if (attemptIds.length === 0) return Promise.resolve([]);
    return db
      .select({
        attemptId: pastPaperAttemptMarks.attemptId,
        questionId: pastPaperAttemptMarks.questionId,
        awarded: pastPaperAttemptMarks.awarded,
      })
      .from(pastPaperAttemptMarks)
      .where(and(eq(pastPaperAttemptMarks.workspaceId, ws), inArray(pastPaperAttemptMarks.attemptId, attemptIds)));
  },

  async insertAttempt(
    db: DbExecutor,
    row: typeof pastPaperAttempts.$inferInsert,
    marks: { questionId: string; awarded: number }[],
  ) {
    await db.insert(pastPaperAttempts).values(row);
    if (marks.length > 0) {
      await db
        .insert(pastPaperAttemptMarks)
        .values(marks.map((m) => ({ workspaceId: row.workspaceId, attemptId: row.id, ...m })));
    }
  },

  async findAttempt(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .select({ id: pastPaperAttempts.id, paperId: pastPaperAttempts.paperId })
      .from(pastPaperAttempts)
      .where(and(eq(pastPaperAttempts.workspaceId, ws), eq(pastPaperAttempts.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },

  async deleteAttempt(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .delete(pastPaperAttempts)
      .where(and(eq(pastPaperAttempts.workspaceId, ws), eq(pastPaperAttempts.id, id)))
      .returning({ id: pastPaperAttempts.id });
    return rows.length > 0;
  },
};
