import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { AppError, notFound } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { getDb } from "@/server/platform/db/client";
import { examsService } from "@/server/modules/exams/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { addDays, dateKey } from "@/server/modules/progress/domain/calendar";
import { progressService } from "@/server/modules/progress/service";
import { settingsService } from "@/server/modules/settings/service";
import {
  type ConfidenceLevel,
  type DeadlineKind,
  daysUntil,
  PLANNER_LIMITS,
  readiness,
  workOrder,
} from "./domain/exams";
import { plannerRepository as repo } from "./repository";
import type {
  createDeadlineSchema,
  deleteDeadlineSchema,
  setDeadlineTopicsSchema,
  setTopicConfidenceSchema,
  updateDeadlineSchema,
} from "./schemas";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Planner module (Architecture §28): exams, tests and assignment deadlines,
 * the topics each one covers, and how confident the student is in each
 * topic. Readiness is worked out from those ratings when it is asked for,
 * never stored, so it always matches what the student last said.
 */

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

type Row = NonNullable<Awaited<ReturnType<typeof repo.findDeadline>>>;

function toDeadline(row: Row, today: string) {
  return {
    id: row.id,
    kind: row.kind as DeadlineKind,
    title: row.title,
    dueOn: row.dueOn,
    /** "HH:MM", or null when no time was given. */
    startsAt: row.startsAt ? row.startsAt.slice(0, 5) : null,
    location: row.location,
    subject: row.subjectId
      ? {
          id: row.subjectId,
          name: row.subjectName ?? "",
          colour: row.subjectColour ?? "",
          archived: row.subjectArchived,
        }
      : null,
    days: daysUntil(today, row.dueOn),
  };
}

export type Deadline = ReturnType<typeof toDeadline>;

async function requireDeadline(ctx: RequestContext, id: string) {
  const row = await repo.findDeadline(getDb(), ctx.workspaceId, id);
  if (!row) throw notFound("That exam");
  return row;
}

async function today(ctx: RequestContext, now: Date) {
  const settings = await settingsService.get(ctx);
  return dateKey(now, settings.timezone);
}

/** Refuses dates too far either side of today, which are almost always typing mistakes. */
function assertSensibleDate(dueOn: string, todayKey: string) {
  if (dueOn > addDays(todayKey, PLANNER_LIMITS.daysAhead)) {
    throw new AppError("VALIDATION", undefined, { fields: { dueOn: ["That's more than three years away"] } });
  }
  if (dueOn < addDays(todayKey, -PLANNER_LIMITS.daysBack)) {
    throw new AppError("VALIDATION", undefined, { fields: { dueOn: ["That's more than a year ago"] } });
  }
}

/** Confidence, recent recall, recent quiz results and past-paper scores for each covered topic. */
async function topicStandings(
  ctx: RequestContext,
  subjectId: string | null,
  topics: { topicId: string; topicName: string; level: number | null }[],
  now: Date,
) {
  const [study, papers] = await Promise.all([
    progressService.getTopicStudy(
      ctx,
      topics.map((t) => t.topicId),
      now,
    ),
    subjectId ? examsService.getTopicScores(ctx, subjectId) : new Map<string, { score: number | null }>(),
  ]);
  return topics.map((t) => {
    const s = study.get(t.topicId);
    const quiz = s?.quiz ?? null;
    return {
      topicId: t.topicId,
      name: t.topicName,
      confidence: t.level as ConfidenceLevel | null,
      cards: s?.cards ?? 0,
      recall: s?.recall ?? null,
      /** Quiz questions on the topic answered in the last month, and how many were right. */
      quiz,
      quizScore: quiz && quiz.answered > 0 ? quiz.correct / quiz.answered : null,
      /** Share of the topic's marks gained in the latest attempt at each past paper, or null if none covers it. */
      paperScore: papers.get(t.topicId)?.score ?? null,
    };
  });
}

export const plannerService = {
  // ── reads ─────────────────────────────────────────────────────────────────
  /** Every exam, split into upcoming (soonest first) and past (latest first), each with its readiness. */
  async listDeadlines(ctx: RequestContext, now = new Date()) {
    const db = getDb();
    const todayKey = await today(ctx, now);
    const rows = await repo.listDeadlines(db, ctx.workspaceId);
    const covered = await repo.coveredTopics(
      db,
      ctx.workspaceId,
      rows.map((r) => r.id),
    );
    const levels = new Map<string, (ConfidenceLevel | null)[]>();
    for (const c of covered) {
      const list = levels.get(c.deadlineId) ?? [];
      list.push(c.level as ConfidenceLevel | null);
      levels.set(c.deadlineId, list);
    }
    const all = rows.map((r) => ({ ...toDeadline(r, todayKey), readiness: readiness(levels.get(r.id) ?? []) }));
    return {
      today: todayKey,
      upcoming: all.filter((d) => d.days >= 0),
      past: all.filter((d) => d.days < 0).reverse(),
    };
  },

  /**
   * One exam with everything its page shows: the subject's topics grouped
   * by section, which of them the exam covers, the student's confidence in
   * each, and their recent flashcard recall.
   */
  async getDeadline(ctx: RequestContext, id: string, now = new Date()) {
    const db = getDb();
    const [row, todayKey] = await Promise.all([requireDeadline(ctx, id), today(ctx, now)]);
    const deadline = toDeadline(row, todayKey);
    const [picked, covered, tree] = await Promise.all([
      repo.listPickedTopics(db, ctx.workspaceId, id),
      repo.coveredTopics(db, ctx.workspaceId, [id]),
      deadline.subject ? knowledgeService.getSubjectTree(ctx, deadline.subject.id) : null,
    ]);
    const topics = await topicStandings(ctx, deadline.subject?.id ?? null, covered, now);
    return {
      ...deadline,
      today: todayKey,
      /** True when the exam covers every topic in its subject, including ones added later. */
      coversWholeSubject: picked.length === 0,
      topics,
      readiness: readiness(topics.map((t) => t.confidence)),
      workOn: workOrder(topics.filter((t) => t.confidence !== 3)).slice(0, 5),
      tree: tree ? { sections: tree.sections, unsectioned: tree.unsectioned, topicCount: tree.topicCount } : null,
    };
  },

  /** How confident the student is in each of these topics; unrated topics are left out. */
  async getConfidence(ctx: RequestContext, topicIds: string[]) {
    const rows = await repo.confidenceFor(getDb(), ctx.workspaceId, topicIds);
    return new Map(rows.map((r) => [r.topicId, r.level as ConfidenceLevel]));
  },

  /** What an exam covers, for building a quiz on it: its subject and the topics it covers. */
  async getDeadlineScope(ctx: RequestContext, id: string) {
    const row = await requireDeadline(ctx, id);
    const db = getDb();
    const [picked, covered] = await Promise.all([
      repo.listPickedTopics(db, ctx.workspaceId, id),
      repo.coveredTopics(db, ctx.workspaceId, [id]),
    ]);
    return {
      id: row.id,
      title: row.title,
      kind: row.kind as DeadlineKind,
      subjectId: row.subjectId,
      /** True when the exam covers its whole subject, so every card in it counts, linked to a topic or not. */
      coversWholeSubject: picked.length === 0,
      topicIds: covered.map((c) => c.topicId),
    };
  },

  /**
   * The next exam that hasn't happened yet, with its readiness and the
   * topics to work on first. What Today shows. Null when nothing is coming up.
   */
  async getNextDeadline(ctx: RequestContext, now = new Date()) {
    const { upcoming } = await this.listDeadlines(ctx, now);
    const next = upcoming[0];
    if (!next) return null;
    const covered = await repo.coveredTopics(getDb(), ctx.workspaceId, [next.id]);
    const topics = await topicStandings(ctx, next.subject?.id ?? null, covered, now);
    return {
      ...next,
      workOn: workOrder(topics.filter((t) => t.confidence !== 3)).slice(0, 3),
      laterCount: upcoming.length - 1,
    };
  },

  // ── writes ────────────────────────────────────────────────────────────────
  async createDeadline(ctx: RequestContext, input: In<typeof createDeadlineSchema>, now = new Date()) {
    assertCanWrite(ctx);
    assertSensibleDate(input.dueOn, await today(ctx, now));
    if (input.subjectId) await knowledgeService.getSubject(ctx, input.subjectId);
    const id = newId();
    await repo.insertDeadline(getDb(), {
      id,
      workspaceId: ctx.workspaceId,
      subjectId: input.subjectId,
      kind: input.kind,
      title: input.title,
      dueOn: input.dueOn,
      startsAt: input.startsAt ?? null,
      location: input.location ?? null,
    });
    return { id };
  },

  async updateDeadline(ctx: RequestContext, input: In<typeof updateDeadlineSchema>, now = new Date()) {
    assertCanWrite(ctx);
    const existing = await requireDeadline(ctx, input.id);
    // An unchanged date may stay, even once it is far in the past.
    if (input.dueOn !== existing.dueOn) assertSensibleDate(input.dueOn, await today(ctx, now));
    if (input.subjectId) await knowledgeService.getSubject(ctx, input.subjectId);
    const subjectChanged = input.subjectId !== existing.subjectId;
    await getDb().transaction(async (tx) => {
      await repo.updateDeadline(tx, ctx.workspaceId, input.id, {
        subjectId: input.subjectId,
        kind: input.kind,
        title: input.title,
        dueOn: input.dueOn,
        startsAt: input.startsAt ?? null,
        location: input.location ?? null,
      });
      // Topics picked from the old subject don't belong to the new one.
      if (subjectChanged) await repo.replacePickedTopics(tx, ctx.workspaceId, input.id, []);
    });
    return { id: input.id };
  },

  async deleteDeadline(ctx: RequestContext, input: In<typeof deleteDeadlineSchema>) {
    assertCanWrite(ctx);
    const deleted = await repo.deleteDeadline(getDb(), ctx.workspaceId, input.id);
    if (!deleted) throw notFound("That exam");
    return { id: input.id };
  },

  /** Sets the topics an exam covers. An empty list means the whole subject. */
  async setDeadlineTopics(ctx: RequestContext, input: In<typeof setDeadlineTopicsSchema>) {
    assertCanWrite(ctx);
    const deadline = await requireDeadline(ctx, input.id);
    const ids = [...new Set(input.topicIds)];
    if (ids.length > 0) {
      if (!deadline.subjectId)
        throw new AppError("VALIDATION", "Choose a subject for this exam before picking topics.");
      const found = await knowledgeService.findTopics(ctx, ids);
      if (found.length !== ids.length || found.some((t) => t.subjectId !== deadline.subjectId)) {
        throw new AppError("VALIDATION", "Some of those topics aren't in this exam's subject.");
      }
    }
    await getDb().transaction((tx) => repo.replacePickedTopics(tx, ctx.workspaceId, input.id, ids));
    return { id: input.id, topicCount: ids.length };
  },

  /** Records how confident the student is in a topic, or clears it. */
  async setTopicConfidence(ctx: RequestContext, input: In<typeof setTopicConfidenceSchema>) {
    assertCanWrite(ctx);
    const [topic] = await knowledgeService.findTopics(ctx, [input.topicId]);
    if (!topic) throw notFound("That topic");
    if (input.level === null) await repo.clearConfidence(getDb(), ctx.workspaceId, input.topicId);
    else await repo.setConfidence(getDb(), ctx.workspaceId, input.topicId, input.level);
    return { topicId: input.topicId, level: input.level };
  },
};
