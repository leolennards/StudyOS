import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { AppError, isAppError, notFound } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { getDb } from "@/server/platform/db/client";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { plannerService } from "@/server/modules/planner/service";
import {
  buildQuiz,
  markAnswer,
  percent,
  type QuestionKind,
  type QuizFormat,
  QUIZ_LIMITS,
  type Random,
} from "./domain/quiz";
import { assessmentRepository as repo } from "./repository";
import type { answerQuestionSchema, attemptIdSchema, overrideAnswerSchema, startQuizSchema } from "./schemas";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Assessment module (Architecture §19): practice quizzes. Until the question
 * bank arrives with AI generation (Phase 6), every question is made from one
 * of the student's flashcards and marked in code (ADR-017). Quizzes are
 * practice only: they never change a card's review schedule.
 */

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

async function requireAttempt(ctx: RequestContext, id: string) {
  const attempt = await repo.findAttempt(getDb(), ctx.workspaceId, id);
  if (!attempt) throw notFound("That quiz");
  return attempt;
}

/** Resolves a deleted exam or topic to null instead of an error. */
async function quietly<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") return null;
    throw e;
  }
}

/** What a quiz was drawn from, in words: "Biology final", "Biology · Mitosis", "Biology" or "All subjects". */
async function scopeLabels(
  ctx: RequestContext,
  attempts: { subjectId: string | null; topicId: string | null; deadlineId: string | null }[],
) {
  const subjectIds = new Set(attempts.map((a) => a.subjectId).filter((v): v is string => v !== null));
  const topicIds = [...new Set(attempts.map((a) => a.topicId).filter((v): v is string => v !== null))];
  const deadlineIds = [...new Set(attempts.map((a) => a.deadlineId).filter((v): v is string => v !== null))];
  const [active, archived, topics, deadlines] = await Promise.all([
    subjectIds.size > 0 ? knowledgeService.listSubjects(ctx) : [],
    subjectIds.size > 0 ? knowledgeService.listSubjects(ctx, { archived: true }) : [],
    knowledgeService.findTopics(ctx, topicIds),
    Promise.all(deadlineIds.map((id) => quietly(plannerService.getDeadlineScope(ctx, id)))),
  ]);
  const subjects = new Map([...active, ...archived].map((s) => [s.id, { name: s.name, colour: s.colour }]));
  const topicNames = new Map(topics.map((t) => [t.id, t.name]));
  const deadlineNames = new Map(deadlines.filter((d) => d !== null).map((d) => [d.id, d.title]));
  return (a: { subjectId: string | null; topicId: string | null; deadlineId: string | null }) => {
    const subject = a.subjectId ? (subjects.get(a.subjectId) ?? null) : null;
    const deadline = a.deadlineId ? deadlineNames.get(a.deadlineId) : undefined;
    const topic = a.topicId ? topicNames.get(a.topicId) : undefined;
    const label = deadline ?? (subject ? (topic ? `${subject.name} · ${topic}` : subject.name) : "All subjects");
    return { label, subject };
  };
}

export const assessmentService = {
  // ── reads ─────────────────────────────────────────────────────────────────
  /**
   * One quiz with everything its screen shows: each question with its card's
   * content, the answers so far, and the score per topic.
   */
  async getAttempt(ctx: RequestContext, id: string) {
    const db = getDb();
    const attempt = await requireAttempt(ctx, id);
    const [questions, topicScores, labelFor] = await Promise.all([
      repo.listQuestions(db, ctx.workspaceId, id),
      repo.topicScores(db, ctx.workspaceId, id),
      scopeLabels(ctx, [attempt]),
    ]);
    const answered = questions.filter((q) => q.answeredAt !== null);
    const correct = answered.filter((q) => q.correct).length;
    return {
      id: attempt.id,
      ...labelFor(attempt),
      subjectId: attempt.subjectId,
      topicId: attempt.topicId,
      deadlineId: attempt.deadlineId,
      format: attempt.format as QuizFormat,
      startedAt: attempt.startedAt,
      finished: attempt.finishedAt !== null || (questions.length > 0 && answered.length === questions.length),
      questions: questions.map((q) => ({
        position: q.position,
        cardId: q.cardId,
        ordinal: q.ordinal,
        subjectId: q.subjectId,
        kind: q.kind as QuestionKind,
        type: q.type,
        front: q.front,
        back: q.back,
        expected: q.expected,
        options: q.options,
        answer:
          q.answeredAt === null
            ? null
            : { given: q.given ?? "", correct: q.correct === true, close: q.close, overridden: q.markedBy === "user" },
      })),
      score: { answered: answered.length, correct, percent: percent(correct, answered.length) },
      topics: topicScores.map((t) => ({ ...t, percent: percent(t.correct, t.answered) })),
    };
  },

  /** The latest quizzes, newest first, with their scores. */
  async listRecent(ctx: RequestContext, limit = 8) {
    const rows = await repo.listAttempts(getDb(), ctx.workspaceId, limit);
    const labelFor = await scopeLabels(ctx, rows);
    return rows.map((r) => ({
      id: r.id,
      ...labelFor(r),
      format: r.format as QuizFormat,
      startedAt: r.startedAt,
      questions: r.questions,
      answered: r.answered,
      correct: r.correct,
      percent: percent(r.correct, r.answered),
      finished: r.finishedAt !== null || (r.questions > 0 && r.answered === r.questions),
    }));
  },

  // ── writes ────────────────────────────────────────────────────────────────
  /**
   * Builds and saves a quiz from a subject, one of its topics, an exam's
   * topics, or the questions missed in an earlier quiz, and returns its id.
   */
  async startQuiz(
    ctx: RequestContext,
    input: In<typeof startQuizSchema>,
    now = new Date(),
    random: Random = Math.random,
  ) {
    assertCanWrite(ctx);
    let scope: { subjectId: string | null; topicId: string | null; deadlineId: string | null };
    let items: Awaited<ReturnType<typeof flashcardsService.getQuizItems>>;
    let count = input.count;

    if (input.retryOf) {
      const earlier = await requireAttempt(ctx, input.retryOf);
      const missed = await repo.missedCardIds(getDb(), ctx.workspaceId, earlier.id);
      if (missed.length === 0) throw new AppError("VALIDATION", "You didn't miss any questions in that quiz.");
      scope = { subjectId: earlier.subjectId, topicId: earlier.topicId, deadlineId: earlier.deadlineId };
      const keys = new Set(missed.map((m) => `${m.cardId}:${m.ordinal}`));
      const found = await flashcardsService.getQuizItems(
        ctx,
        { subjectId: earlier.subjectId ?? undefined, cardIds: [...new Set(missed.map((m) => m.cardId))] },
        QUIZ_LIMITS.pool,
      );
      items = { pool: found.pool, candidates: found.candidates.filter((c) => keys.has(`${c.cardId}:${c.ordinal}`)) };
      count = Math.min(missed.length, QUIZ_LIMITS.questions);
    } else if (input.deadlineId) {
      const exam = await plannerService.getDeadlineScope(ctx, input.deadlineId);
      if (!exam.subjectId) {
        throw new AppError(
          "VALIDATION",
          "Choose a subject for this exam first, so there are flashcards to quiz you on.",
        );
      }
      scope = { subjectId: exam.subjectId, topicId: null, deadlineId: exam.id };
      items = await flashcardsService.getQuizItems(
        ctx,
        { subjectId: exam.subjectId, topicIds: exam.coversWholeSubject ? undefined : exam.topicIds },
        QUIZ_LIMITS.pool,
      );
    } else if (input.topicId) {
      const [topic] = await knowledgeService.findTopics(ctx, [input.topicId]);
      if (!topic || (input.subjectId && topic.subjectId !== input.subjectId)) throw notFound("That topic");
      scope = { subjectId: topic.subjectId, topicId: topic.id, deadlineId: null };
      items = await flashcardsService.getQuizItems(
        ctx,
        { subjectId: topic.subjectId, topicIds: [topic.id] },
        QUIZ_LIMITS.pool,
      );
    } else {
      scope = { subjectId: input.subjectId ?? null, topicId: null, deadlineId: null };
      items = await flashcardsService.getQuizItems(ctx, { subjectId: input.subjectId }, QUIZ_LIMITS.pool);
    }

    const questions = buildQuiz(items.candidates, items.pool, { count, format: input.format, random });
    if (questions.length === 0) {
      throw new AppError("VALIDATION", "There are no flashcards to quiz you on here yet. Add some cards first.");
    }
    const id = newId();
    await getDb().transaction((tx) =>
      repo.insertAttempt(
        tx,
        { id, workspaceId: ctx.workspaceId, ...scope, format: input.format, startedAt: now },
        questions.map((q, position) => ({
          workspaceId: ctx.workspaceId,
          attemptId: id,
          position,
          cardId: q.cardId,
          ordinal: q.ordinal,
          kind: q.kind,
          expected: q.expected,
          options: q.options,
        })),
      ),
    );
    return { id, questions: questions.length };
  },

  /**
   * Marks one answer and records it. A question is answered once: answering
   * it again (a retried request) returns the first mark.
   */
  async answerQuestion(ctx: RequestContext, input: In<typeof answerQuestionSchema>, now = new Date()) {
    assertCanWrite(ctx);
    const db = getDb();
    await requireAttempt(ctx, input.attemptId);
    const question = await repo.findQuestion(db, ctx.workspaceId, input.attemptId, input.position);
    if (!question) throw notFound("That question");
    const key = { attemptId: input.attemptId, position: input.position };
    if (question.answeredAt === null) {
      let mark;
      try {
        mark = markAnswer(
          { kind: question.kind, expected: question.expected, options: question.options },
          input.answer,
        );
      } catch {
        throw new AppError("VALIDATION", "That answer doesn't fit the question.");
      }
      const saved = await repo.recordAnswer(db, ctx.workspaceId, key, {
        ...mark,
        answeredAt: now,
        durationMs: input.durationMs ?? null,
      });
      if (saved) return { correct: mark.correct, close: mark.close, expected: question.expected };
    }
    const stored = await repo.findQuestion(db, ctx.workspaceId, input.attemptId, input.position);
    return { correct: stored?.correct === true, close: stored?.close ?? false, expected: question.expected };
  },

  /** "I was right": the student counts a typed answer that was marked wrong. */
  async overrideAnswer(ctx: RequestContext, input: In<typeof overrideAnswerSchema>) {
    assertCanWrite(ctx);
    const db = getDb();
    await requireAttempt(ctx, input.attemptId);
    const question = await repo.findQuestion(db, ctx.workspaceId, input.attemptId, input.position);
    if (!question) throw notFound("That question");
    if (question.kind !== "typed" || question.answeredAt === null) {
      throw new AppError("VALIDATION", "Only a typed answer that has been marked can be changed.");
    }
    await repo.overrideAnswer(db, ctx.workspaceId, { attemptId: input.attemptId, position: input.position });
    return { correct: true };
  },

  /** Ends a quiz, answered or not; questions left unanswered don't count against the score. */
  async finishQuiz(ctx: RequestContext, input: In<typeof attemptIdSchema>, now = new Date()) {
    assertCanWrite(ctx);
    await requireAttempt(ctx, input.id);
    await repo.finishAttempt(getDb(), ctx.workspaceId, input.id, now);
    return { id: input.id };
  },
};
