import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import { cards, cardTopics, quizAttempts, quizQuestions, topics } from "@/server/platform/db/schema";

/** All SQL for the assessment module. Every query is scoped by workspace id. */
export type AttemptInsert = typeof quizAttempts.$inferInsert;
export type QuestionInsert = typeof quizQuestions.$inferInsert;
export type QuestionRow = typeof quizQuestions.$inferSelect;

const num = (v: unknown) => Number(v ?? 0);

export const assessmentRepository = {
  async insertAttempt(db: DbExecutor, attempt: AttemptInsert, questions: QuestionInsert[]) {
    await db.insert(quizAttempts).values(attempt);
    if (questions.length > 0) await db.insert(quizQuestions).values(questions);
  },

  async findAttempt(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.id, id), eq(quizAttempts.workspaceId, ws)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** An attempt's questions in order, each with its card's current content. */
  listQuestions(db: DbExecutor, ws: string, attemptId: string) {
    return db
      .select({
        position: quizQuestions.position,
        cardId: quizQuestions.cardId,
        ordinal: quizQuestions.ordinal,
        kind: quizQuestions.kind,
        expected: quizQuestions.expected,
        options: quizQuestions.options,
        given: quizQuestions.given,
        correct: quizQuestions.correct,
        close: quizQuestions.close,
        markedBy: quizQuestions.markedBy,
        answeredAt: quizQuestions.answeredAt,
        subjectId: cards.subjectId,
        type: cards.type,
        front: cards.front,
        back: cards.back,
      })
      .from(quizQuestions)
      .innerJoin(cards, and(eq(cards.id, quizQuestions.cardId), eq(cards.workspaceId, quizQuestions.workspaceId)))
      .where(and(eq(quizQuestions.workspaceId, ws), eq(quizQuestions.attemptId, attemptId)))
      .orderBy(asc(quizQuestions.position));
  },

  async findQuestion(db: DbExecutor, ws: string, attemptId: string, position: number) {
    const rows = await db
      .select()
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.workspaceId, ws),
          eq(quizQuestions.attemptId, attemptId),
          eq(quizQuestions.position, position),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /** Records an answer once: returns false if the question was already answered. */
  async recordAnswer(
    db: DbExecutor,
    ws: string,
    key: { attemptId: string; position: number },
    answer: { given: string; correct: boolean; close: boolean; answeredAt: Date; durationMs: number | null },
  ) {
    const rows = await db
      .update(quizQuestions)
      .set({ ...answer, markedBy: "auto" })
      .where(
        and(
          eq(quizQuestions.workspaceId, ws),
          eq(quizQuestions.attemptId, key.attemptId),
          eq(quizQuestions.position, key.position),
          isNull(quizQuestions.answeredAt),
        ),
      )
      .returning({ position: quizQuestions.position });
    return rows.length > 0;
  },

  async overrideAnswer(db: DbExecutor, ws: string, key: { attemptId: string; position: number }) {
    await db
      .update(quizQuestions)
      .set({ correct: true, markedBy: "user" })
      .where(
        and(
          eq(quizQuestions.workspaceId, ws),
          eq(quizQuestions.attemptId, key.attemptId),
          eq(quizQuestions.position, key.position),
        ),
      );
  },

  async finishAttempt(db: DbExecutor, ws: string, id: string, at: Date) {
    await db
      .update(quizAttempts)
      .set({ finishedAt: at })
      .where(and(eq(quizAttempts.id, id), eq(quizAttempts.workspaceId, ws), isNull(quizAttempts.finishedAt)));
  },

  /** Right and answered counts per topic for one attempt's questions, by the cards' current topics. */
  async topicScores(db: DbExecutor, ws: string, attemptId: string) {
    const result = await db.execute(sql`
      select ${topics.id} as topic_id, ${topics.name} as name,
             count(*) filter (where ${quizQuestions.answeredAt} is not null) as answered,
             count(*) filter (where ${quizQuestions.correct}) as correct
      from ${quizQuestions}
      join ${cardTopics} on ${cardTopics.cardId} = ${quizQuestions.cardId} and ${cardTopics.workspaceId} = ${ws}
      join ${topics} on ${topics.id} = ${cardTopics.topicId} and ${topics.workspaceId} = ${ws}
      where ${quizQuestions.workspaceId} = ${ws} and ${quizQuestions.attemptId} = ${attemptId}
      group by ${topics.id}, ${topics.name}, ${topics.position}
      order by ${topics.position}, ${topics.name}
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({
      topicId: String(r.topic_id),
      name: String(r.name),
      answered: num(r.answered),
      correct: num(r.correct),
    }));
  },

  /** The latest attempts, newest first, with their counts. */
  async listAttempts(db: DbExecutor, ws: string, limit: number) {
    const rows = await db
      .select({
        id: quizAttempts.id,
        subjectId: quizAttempts.subjectId,
        topicId: quizAttempts.topicId,
        deadlineId: quizAttempts.deadlineId,
        format: quizAttempts.format,
        startedAt: quizAttempts.startedAt,
        finishedAt: quizAttempts.finishedAt,
        questions: sql<number>`count(${quizQuestions.position})`.mapWith(Number),
        answered: sql<number>`count(${quizQuestions.answeredAt})`.mapWith(Number),
        correct: sql<number>`count(*) filter (where ${quizQuestions.correct})`.mapWith(Number),
      })
      .from(quizAttempts)
      .leftJoin(
        quizQuestions,
        and(eq(quizQuestions.attemptId, quizAttempts.id), eq(quizQuestions.workspaceId, quizAttempts.workspaceId)),
      )
      .where(eq(quizAttempts.workspaceId, ws))
      .groupBy(quizAttempts.id)
      .orderBy(desc(quizAttempts.startedAt))
      .limit(limit);
    return rows;
  },

  /** The questions of an attempt answered wrong (or skipped), as card items to ask again. */
  missedCardIds(db: DbExecutor, ws: string, attemptId: string) {
    return db
      .select({ cardId: quizQuestions.cardId, ordinal: quizQuestions.ordinal })
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.workspaceId, ws),
          eq(quizQuestions.attemptId, attemptId),
          sql`coalesce(${quizQuestions.correct}, false) = false`,
        ),
      );
  },
};
