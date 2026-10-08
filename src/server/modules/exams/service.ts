import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { AppError, notFound } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { getDb } from "@/server/platform/db/client";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { libraryService } from "@/server/modules/library/service";
import { addDays, dateKey } from "@/server/modules/progress/domain/calendar";
import { settingsService } from "@/server/modules/settings/service";
import {
  type AnalysedPaper,
  analysePapers,
  focusTopics,
  PAPER_LIMITS,
  paperTotal,
  scoreShare,
  trend,
} from "./domain/papers";
import { examsRepository as repo, type PaperRow } from "./repository";
import type {
  attemptIdSchema,
  createPaperSchema,
  logAttemptSchema,
  paperIdSchema,
  setQuestionsSchema,
  updatePaperSchema,
} from "./schemas";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Past papers (Architecture §22, the `exams` module): the papers a student
 * has for a subject, the questions on each with their marks and topics,
 * and every time they sat one. The topic analysis is worked out from those
 * when it is asked for, never stored.
 *
 * The architecture extracts a paper's questions from the uploaded file with
 * a language model; until that exists the student types them in, which is
 * the review step the architecture asks for anyway (ADR-019).
 */

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

async function requirePaper(ctx: RequestContext, id: string) {
  const row = await repo.findPaper(getDb(), ctx.workspaceId, id);
  if (!row) throw notFound("That past paper");
  return row;
}

async function today(ctx: RequestContext, now: Date) {
  const settings = await settingsService.get(ctx);
  return dateKey(now, settings.timezone);
}

/** A linked document must be in the paper's subject. */
async function assertDocuments(ctx: RequestContext, subjectId: string, ids: (string | null | undefined)[]) {
  for (const [i, id] of ids.entries()) {
    if (!id) continue;
    const field = i === 0 ? "documentId" : "markSchemeId";
    const doc = await libraryService.getDocument(ctx, id).catch(() => null);
    if (!doc || doc.subjectId !== subjectId) {
      throw new AppError("VALIDATION", undefined, {
        fields: { [field]: ["Pick a document from this subject"] },
      });
    }
  }
}

type Question = Awaited<ReturnType<typeof repo.listQuestions>>[number];
type Attempt = Awaited<ReturnType<typeof repo.listAttempts>>[number];

function summarise(paper: PaperRow, questions: Question[], attempts: Attempt[]) {
  const scores = attempts.map((a) => ({ ...a, share: scoreShare(a.score, a.outOf) }));
  const latest = scores.at(-1) ?? null;
  const best = scores.reduce<(typeof scores)[number] | null>((b, a) => (!b || a.share > b.share ? a : b), null);
  return {
    id: paper.id,
    subjectId: paper.subjectId,
    title: paper.title,
    year: paper.year,
    durationMin: paper.durationMin,
    totalMarks: paper.totalMarks,
    documentId: paper.documentId,
    markSchemeId: paper.markSchemeId,
    /** The questions' marks once entered, otherwise the total given for the paper. */
    total: paperTotal(questions, paper.totalMarks),
    questionCount: questions.length,
    attempts: scores,
    latest,
    best,
    trend: trend(attempts),
  };
}

export type PaperSummary = ReturnType<typeof summarise>;

/** The papers in the analysis, with the marks from the latest attempt at each that has them. */
function toAnalysed(
  papers: PaperRow[],
  questions: Question[],
  attempts: Attempt[],
  marks: { attemptId: string; questionId: string; awarded: number }[],
): AnalysedPaper[] {
  return papers.map((p) => {
    const qs = questions.filter((q) => q.paperId === p.id);
    const ids = new Set(qs.map((q) => q.id));
    // The latest attempt with marks per question for this paper's questions.
    const withMarks = attempts
      .filter((a) => a.paperId === p.id)
      .reverse()
      .find((a) => marks.some((m) => m.attemptId === a.id && ids.has(m.questionId)));
    const latestMarks = withMarks
      ? new Map(marks.filter((m) => m.attemptId === withMarks.id).map((m) => [m.questionId, m.awarded]))
      : null;
    return { id: p.id, questions: qs.map((q) => ({ id: q.id, marks: q.marks, topicIds: q.topicIds })), latestMarks };
  });
}

/** Every paper in a subject with its questions, attempts and marks. */
async function loadSubject(ctx: RequestContext, subjectId: string) {
  const db = getDb();
  const papers = await repo.listPapers(db, ctx.workspaceId, subjectId);
  const ids = papers.map((p) => p.id);
  const [questions, attempts] = await Promise.all([
    repo.listQuestions(db, ctx.workspaceId, ids),
    repo.listAttempts(db, ctx.workspaceId, ids),
  ]);
  const marks = await repo.listAttemptMarks(
    db,
    ctx.workspaceId,
    attempts.map((a) => a.id),
  );
  return { papers, questions, attempts, marks };
}

export const examsService = {
  // ── reads ─────────────────────────────────────────────────────────────────
  /**
   * A subject's past papers with their scores, and how the marks across
   * them are spread over its topics. What the subject's Past papers tab shows.
   */
  async getSubjectPapers(ctx: RequestContext, subjectId: string) {
    const topics = await knowledgeService.listTopics(ctx, subjectId);
    const { papers, questions, attempts, marks } = await loadSubject(ctx, subjectId);
    const analysis = analysePapers(toAnalysed(papers, questions, attempts, marks));
    const name = new Map(topics.map((t) => [t.id, t.name]));
    const named = analysis.topics.map((t) => ({ ...t, name: name.get(t.topicId) ?? "" }));
    return {
      papers: papers.map((p) =>
        summarise(
          p,
          questions.filter((q) => q.paperId === p.id),
          attempts.filter((a) => a.paperId === p.id),
        ),
      ),
      analysis: { ...analysis, topics: named },
      focus: focusTopics({ ...analysis, topics: named }),
    };
  },

  /** How many past papers a subject has. */
  async countPapers(ctx: RequestContext, subjectId: string) {
    return (await repo.listPapers(getDb(), ctx.workspaceId, subjectId)).length;
  },

  /** One paper with its questions, its attempts and the marks per question in each. */
  async getPaper(ctx: RequestContext, id: string, now = new Date()) {
    const paper = await requirePaper(ctx, id);
    const db = getDb();
    const [questions, attempts, todayKey] = await Promise.all([
      repo.listQuestions(db, ctx.workspaceId, [id]),
      repo.listAttempts(db, ctx.workspaceId, [id]),
      today(ctx, now),
    ]);
    const marks = await repo.listAttemptMarks(
      db,
      ctx.workspaceId,
      attempts.map((a) => a.id),
    );
    const [document, markScheme] = await Promise.all(
      [paper.documentId, paper.markSchemeId].map((docId) =>
        docId
          ? libraryService
              .getDocument(ctx, docId)
              .then((d) => ({ id: d.id, title: d.title }))
              .catch(() => null)
          : null,
      ),
    );
    return {
      ...summarise(paper, questions, attempts),
      today: todayKey,
      questions,
      document,
      markScheme,
      /** Marks per question, by attempt id. */
      marks: Object.fromEntries(
        attempts.map((a) => [
          a.id,
          Object.fromEntries(marks.filter((m) => m.attemptId === a.id).map((m) => [m.questionId, m.awarded])),
        ]),
      ) as Record<string, Record<string, number>>,
    };
  },

  /**
   * The share of marks gained on each topic in the latest attempt at each
   * of a subject's papers, for the topics that have one. Shown with exam readiness.
   */
  async getTopicScores(ctx: RequestContext, subjectId: string) {
    const { papers, questions, attempts, marks } = await loadSubject(ctx, subjectId);
    const analysis = analysePapers(toAnalysed(papers, questions, attempts, marks));
    return new Map(
      analysis.topics.map((t) => [t.topicId, { score: t.score, share: t.share, papers: t.papers }] as const),
    );
  },

  /**
   * Each subject's papers in the order to sit them for practice: ones never
   * sat first, newest year first, then the ones sat longest ago. For planning.
   */
  async getPapersToSit(ctx: RequestContext, subjectIds: string[]) {
    const db = getDb();
    const papers = await repo.listPapersIn(db, ctx.workspaceId, subjectIds);
    const attempts = await repo.listAttempts(
      db,
      ctx.workspaceId,
      papers.map((p) => p.id),
    );
    const lastSat = new Map<string, string>();
    for (const a of attempts) lastSat.set(a.paperId, a.takenOn);
    const ordered = [...papers].sort((a, b) => {
      const la = lastSat.get(a.id) ?? "";
      const lb = lastSat.get(b.id) ?? "";
      if (la !== lb) return la < lb ? -1 : 1;
      return (
        (b.year ?? 0) - (a.year ?? 0) ||
        a.title.localeCompare(b.title, undefined, { numeric: true }) ||
        a.id.localeCompare(b.id)
      );
    });
    const bySubject = new Map<string, { id: string; title: string; minutes: number | null }[]>();
    for (const p of ordered) {
      const list = bySubject.get(p.subjectId) ?? [];
      list.push({ id: p.id, title: p.title, minutes: p.durationMin });
      bySubject.set(p.subjectId, list);
    }
    return bySubject;
  },

  // ── writes ────────────────────────────────────────────────────────────────
  async createPaper(ctx: RequestContext, input: In<typeof createPaperSchema>) {
    assertCanWrite(ctx);
    await knowledgeService.getSubject(ctx, input.subjectId);
    await assertDocuments(ctx, input.subjectId, [input.documentId, input.markSchemeId]);
    const id = newId();
    await repo.insertPaper(getDb(), {
      id,
      workspaceId: ctx.workspaceId,
      subjectId: input.subjectId,
      title: input.title,
      year: input.year ?? null,
      durationMin: input.durationMin ?? null,
      totalMarks: input.totalMarks ?? null,
      documentId: input.documentId ?? null,
      markSchemeId: input.markSchemeId ?? null,
    });
    return { id, subjectId: input.subjectId };
  },

  async updatePaper(ctx: RequestContext, input: In<typeof updatePaperSchema>) {
    assertCanWrite(ctx);
    const paper = await requirePaper(ctx, input.id);
    await assertDocuments(ctx, paper.subjectId, [input.documentId, input.markSchemeId]);
    await repo.updatePaper(getDb(), ctx.workspaceId, input.id, {
      title: input.title,
      year: input.year ?? null,
      durationMin: input.durationMin ?? null,
      totalMarks: input.totalMarks ?? null,
      documentId: input.documentId ?? null,
      markSchemeId: input.markSchemeId ?? null,
    });
    return { id: input.id, subjectId: paper.subjectId };
  },

  async deletePaper(ctx: RequestContext, input: In<typeof paperIdSchema>) {
    assertCanWrite(ctx);
    const paper = await requirePaper(ctx, input.id);
    await repo.deletePaper(getDb(), ctx.workspaceId, input.id);
    return { id: input.id, subjectId: paper.subjectId };
  },

  /**
   * Saves a paper's questions in order. Questions that keep their id keep
   * the marks logged against them; questions left out are deleted with theirs.
   */
  async setQuestions(ctx: RequestContext, input: In<typeof setQuestionsSchema>) {
    assertCanWrite(ctx);
    const paper = await requirePaper(ctx, input.paperId);
    const db = getDb();
    const existing = new Set((await repo.listQuestions(db, ctx.workspaceId, [paper.id])).map((q) => q.id));
    const ids = input.questions.flatMap((q) => (q.id ? [q.id] : []));
    if (ids.some((id) => !existing.has(id)) || new Set(ids).size !== ids.length) {
      throw new AppError("CONFLICT", "The questions changed in another tab. Reload the page and try again.");
    }
    const total = input.questions.reduce((sum, q) => sum + q.marks, 0);
    if (total > PAPER_LIMITS.totalMarks) {
      throw new AppError("VALIDATION", `A paper can be worth up to ${PAPER_LIMITS.totalMarks} marks in all.`);
    }
    const topicIds = [...new Set(input.questions.flatMap((q) => q.topicIds))];
    if (topicIds.length > 0) {
      const found = await knowledgeService.findTopics(ctx, topicIds);
      if (found.length !== topicIds.length || found.some((t) => t.subjectId !== paper.subjectId)) {
        throw new AppError("VALIDATION", "Some of those topics aren't in this paper's subject.");
      }
    }
    const rows = input.questions.map((q) => ({
      id: q.id ?? newId(),
      isNew: !q.id,
      number: q.number,
      marks: q.marks,
      topicIds: q.topicIds,
    }));
    await db.transaction(async (tx) => {
      await repo.replaceQuestions(tx, ctx.workspaceId, paper.id, rows);
      await repo.updatePaper(tx, ctx.workspaceId, paper.id, {});
    });
    return { id: paper.id, subjectId: paper.subjectId, questionCount: rows.length, total };
  },

  /** Records a sitting of a paper. */
  async logAttempt(ctx: RequestContext, input: In<typeof logAttemptSchema>, now = new Date()) {
    assertCanWrite(ctx);
    const paper = await requirePaper(ctx, input.paperId);
    const todayKey = await today(ctx, now);
    if (input.takenOn > todayKey) {
      throw new AppError("VALIDATION", undefined, { fields: { takenOn: ["That's in the future"] } });
    }
    if (input.takenOn < addDays(todayKey, -PAPER_LIMITS.attemptDaysBack)) {
      throw new AppError("VALIDATION", undefined, { fields: { takenOn: ["That's more than five years ago"] } });
    }
    const db = getDb();
    const questions = await repo.listQuestions(db, ctx.workspaceId, [paper.id]);
    let score: number;
    let outOf: number;
    let marks: { questionId: string; awarded: number }[] = [];

    if (questions.length > 0) {
      const given = new Map(input.marks.map((m) => [m.questionId, m.awarded]));
      if (
        given.size !== input.marks.length ||
        questions.some((q) => !given.has(q.id)) ||
        given.size !== questions.length
      ) {
        throw new AppError("CONFLICT", "The questions on this paper changed. Reload the page and try again.");
      }
      const over = questions.find((q) => given.get(q.id)! > q.marks);
      if (over) {
        throw new AppError("VALIDATION", `Question ${over.number} is only worth ${over.marks} marks.`);
      }
      marks = questions.map((q) => ({ questionId: q.id, awarded: given.get(q.id)! }));
      score = marks.reduce((sum, m) => sum + m.awarded, 0);
      outOf = questions.reduce((sum, q) => sum + q.marks, 0);
    } else {
      const total = input.outOf ?? paper.totalMarks;
      if (input.score === undefined) {
        throw new AppError("VALIDATION", undefined, { fields: { score: ["Enter your score"] } });
      }
      if (!total) throw new AppError("VALIDATION", undefined, { fields: { outOf: ["Enter what it was out of"] } });
      if (input.score > total) {
        throw new AppError("VALIDATION", undefined, { fields: { score: [`That's more than ${total}`] } });
      }
      score = input.score;
      outOf = total;
    }

    const id = newId();
    await db.transaction((tx) =>
      repo.insertAttempt(
        tx,
        {
          id,
          workspaceId: ctx.workspaceId,
          paperId: paper.id,
          takenOn: input.takenOn,
          minutes: input.minutes ?? null,
          score,
          outOf,
        },
        marks,
      ),
    );
    return { id, paperId: paper.id, subjectId: paper.subjectId, score, outOf };
  },

  async deleteAttempt(ctx: RequestContext, input: In<typeof attemptIdSchema>) {
    assertCanWrite(ctx);
    const db = getDb();
    const attempt = await repo.findAttempt(db, ctx.workspaceId, input.id);
    if (!attempt) throw notFound("That attempt");
    const paper = await requirePaper(ctx, attempt.paperId);
    await repo.deleteAttempt(db, ctx.workspaceId, input.id);
    return { id: input.id, paperId: paper.id, subjectId: paper.subjectId };
  },
};
