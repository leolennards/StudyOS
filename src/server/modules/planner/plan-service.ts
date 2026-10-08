import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { AppError, notFound } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { getDb } from "@/server/platform/db/client";
import { examsService } from "@/server/modules/exams/service";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { addDays, dateKey } from "@/server/modules/progress/domain/calendar";
import { progressService } from "@/server/modules/progress/service";
import { settingsService } from "@/server/modules/settings/service";
import type { DeadlineKind } from "./domain/exams";
import {
  buildPlan,
  DEFAULT_WEEK_MINUTES,
  minutesOn,
  PLAN_LIMITS,
  type PlanItemKind,
  type PlanItemStatus,
  planDays,
  topicNeed,
} from "./domain/plan";
import { planRepository as repo } from "./plan-repository";
import { plannerRepository } from "./repository";
import type { movePlanItemSchema, saveWeekSchema, setPlanItemStatusSchema } from "./schemas";
import { plannerService } from "./service";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Weekly study plans (Architecture §28): the student says how many minutes
 * they have free on each day of the week, and the plan fills the next seven
 * days with flashcards, topics for their exams, past papers and assignments.
 * Making the plan again keeps what is finished and replans the rest.
 */

/** Plan items older than this are cleared when a new plan is made. */
const KEEP_DAYS = 30;

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

async function today(ctx: RequestContext, now: Date) {
  const settings = await settingsService.get(ctx);
  return dateKey(now, settings.timezone);
}

type ItemRow = Awaited<ReturnType<typeof repo.listItems>>[number];

function toItem(row: ItemRow) {
  return {
    id: row.id,
    day: row.day,
    kind: row.kind as PlanItemKind,
    minutes: row.minutes,
    cards: row.cards,
    status: row.status as PlanItemStatus,
    deadline: row.deadlineId
      ? {
          id: row.deadlineId,
          title: row.deadlineTitle ?? "",
          kind: row.deadlineKind as DeadlineKind,
          dueOn: row.deadlineDueOn ?? "",
        }
      : null,
    topic: row.topicId ? { id: row.topicId, name: row.topicName ?? "", cards: Number(row.topicCards) } : null,
    paper: row.paperId ? { id: row.paperId, title: row.paperTitle ?? "" } : null,
    subject: row.subjectId ? { id: row.subjectId, name: row.subjectName ?? "", colour: row.subjectColour ?? "" } : null,
  };
}

export type PlanItem = ReturnType<typeof toItem>;

/** Flashcards expected on each day of the plan: what is waiting today, then what falls due. */
async function reviewForecast(ctx: RequestContext, todayKey: string, now: Date) {
  const [overview, due, settings] = await Promise.all([
    flashcardsService.getOverview(ctx, {}, now),
    progressService.getDueByDay(ctx, PLAN_LIMITS.days, now),
    settingsService.get(ctx),
  ]);
  const cards = new Map<string, number>([[todayKey, overview.due + overview.new]]);
  // New cards keep coming at the daily limit until there are none left.
  let newLeft = overview.newHeldBack;
  for (const day of planDays(todayKey).slice(1)) {
    const fresh = Math.min(settings.newCardsPerDay, newLeft);
    newLeft -= fresh;
    cards.set(day, Math.min(due.get(day) ?? 0, settings.reviewsPerDay) + fresh);
  }
  return cards;
}

export const studyPlanService = {
  // ── reads ─────────────────────────────────────────────────────────────────
  /**
   * The week ahead: each of the next seven days with the time free, the
   * items planned for it, and whether the plan reaches that far.
   */
  async getWeek(ctx: RequestContext, now = new Date()) {
    const db = getDb();
    const todayKey = await today(ctx, now);
    const days = planDays(todayKey);
    const [plan, rows, missed] = await Promise.all([
      repo.findPlan(db, ctx.workspaceId),
      repo.listItems(db, ctx.workspaceId, todayKey, days[days.length - 1]!),
      repo.countMissed(db, ctx.workspaceId, todayKey, addDays(todayKey, -PLAN_LIMITS.days)),
    ]);
    const weekMinutes = plan?.weekMinutes ?? [...DEFAULT_WEEK_MINUTES];
    const items = rows.map(toItem);
    const lastPlanned = plan?.startsOn ? addDays(plan.startsOn, PLAN_LIMITS.days - 1) : null;
    return {
      today: todayKey,
      /** False until the student has said when they can study. */
      hasWeek: plan !== null,
      weekMinutes,
      /** The first day of the current plan, or null before one is made. */
      startsOn: plan?.startsOn ?? null,
      plannedAt: plan?.plannedAt ?? null,
      /** Items left undone on the days before today, in the last week. */
      missed,
      days: days.map((day) => {
        const dayItems = items.filter((i) => i.day === day);
        return {
          day,
          free: minutesOn(day, weekMinutes),
          /** True when the current plan covers this day. */
          planned: lastPlanned !== null && day <= lastPlanned,
          items: dayItems,
          minutes: dayItems.filter((i) => i.status !== "skipped").reduce((t, i) => t + i.minutes, 0),
          doneMinutes: dayItems.filter((i) => i.status === "done").reduce((t, i) => t + i.minutes, 0),
        };
      }),
    };
  },

  /** Today's items, for the Today page. Null before the student has made a plan. */
  async getToday(ctx: RequestContext, now = new Date()) {
    const db = getDb();
    const todayKey = await today(ctx, now);
    const plan = await repo.findPlan(db, ctx.workspaceId);
    if (!plan?.startsOn) return null;
    const rows = await repo.listItems(db, ctx.workspaceId, todayKey, todayKey);
    const items = rows.map(toItem);
    return {
      today: todayKey,
      /** True when the plan was made on an earlier day and no longer reaches a week ahead. */
      outdated: plan.startsOn < todayKey,
      /** True when the plan's last day is before today. */
      ended: addDays(plan.startsOn, PLAN_LIMITS.days - 1) < todayKey,
      items,
    };
  },

  // ── writes ────────────────────────────────────────────────────────────────
  /** Saves the minutes free on each day of the week, then plans the week with them. */
  async saveWeek(ctx: RequestContext, input: In<typeof saveWeekSchema>, now = new Date()) {
    assertCanWrite(ctx);
    await repo.saveWeek(getDb(), ctx.workspaceId, input.weekMinutes);
    return this.makePlan(ctx, now);
  },

  /**
   * Plans the next seven days from today. Finished items stay where they
   * are and their time counts against their day; everything else from
   * today on is planned afresh from the current exams, scores and cards.
   */
  async makePlan(ctx: RequestContext, now = new Date()) {
    assertCanWrite(ctx);
    const db = getDb();
    const todayKey = await today(ctx, now);
    const plan = await repo.findPlan(db, ctx.workspaceId);
    const weekMinutes = plan?.weekMinutes ?? [...DEFAULT_WEEK_MINUTES];
    if (!plan) await repo.saveWeek(db, ctx.workspaceId, weekMinutes);

    const [{ upcoming }, done, reviewCards] = await Promise.all([
      plannerService.listDeadlines(ctx, now),
      repo.listDone(db, ctx.workspaceId, todayKey),
      reviewForecast(ctx, todayKey, now),
    ]);
    const ahead = upcoming.filter((d) => d.days >= 1);
    const examRows = ahead.filter((d) => d.kind !== "assignment");
    const subjectIds = [...new Set(examRows.flatMap((d) => (d.subject ? [d.subject.id] : [])))];
    const [covered, papers] = await Promise.all([
      plannerRepository.coveredTopics(
        db,
        ctx.workspaceId,
        examRows.map((d) => d.id),
      ),
      examsService.getPapersToSit(ctx, subjectIds),
    ]);
    const exams = await Promise.all(
      examRows.map(async (d) => {
        const topics = await plannerService.getTopicStandings(
          ctx,
          d.subject?.id ?? null,
          covered.filter((c) => c.deadlineId === d.id),
          now,
        );
        return {
          id: d.id,
          dueOn: d.dueOn,
          topics: topics.map((t) => ({ topicId: t.topicId, need: topicNeed(t) })),
          papers: d.subject ? (papers.get(d.subject.id) ?? []) : [],
        };
      }),
    );

    const nextPosition = new Map<string, number>();
    for (const d of done) nextPosition.set(d.day, Math.max(nextPosition.get(d.day) ?? 0, d.position + 1));
    const planned = buildPlan({
      today: todayKey,
      weekMinutes,
      done: done.map((d) => ({ ...d, kind: d.kind as PlanItemKind })),
      reviewCards,
      exams,
      assignments: ahead.filter((d) => d.kind === "assignment").map((d) => ({ id: d.id, dueOn: d.dueOn })),
    });

    await db.transaction(async (tx) => {
      await repo.clearFrom(tx, ctx.workspaceId, todayKey, addDays(todayKey, -KEEP_DAYS));
      await repo.insertItems(
        tx,
        planned.map((item) => {
          const position = nextPosition.get(item.day) ?? 0;
          nextPosition.set(item.day, position + 1);
          return { id: newId(), workspaceId: ctx.workspaceId, position, ...item };
        }),
      );
      await repo.markPlanned(tx, ctx.workspaceId, todayKey, now);
    });
    return { items: planned.length };
  },

  /** Ticks an item off, skips it, or puts it back to do. */
  async setItemStatus(ctx: RequestContext, input: In<typeof setPlanItemStatusSchema>, now = new Date()) {
    assertCanWrite(ctx);
    const updated = await repo.updateItem(getDb(), ctx.workspaceId, input.id, {
      status: input.status,
      doneAt: input.status === "done" ? now : null,
    });
    if (!updated) throw notFound("That plan item");
    return { id: input.id, status: input.status };
  },

  /** Moves an item to another day of the plan, at the end of that day. */
  async moveItem(ctx: RequestContext, input: In<typeof movePlanItemSchema>, now = new Date()) {
    assertCanWrite(ctx);
    const db = getDb();
    const item = await repo.findItem(db, ctx.workspaceId, input.id);
    if (!item) throw notFound("That plan item");
    const todayKey = await today(ctx, now);
    if (input.day < todayKey || input.day > addDays(todayKey, PLAN_LIMITS.days - 1)) {
      throw new AppError("VALIDATION", "Pick a day in the next week.");
    }
    const position = await repo.nextPosition(db, ctx.workspaceId, input.day, input.id);
    await repo.updateItem(db, ctx.workspaceId, input.id, { day: input.day, position });
    return { id: input.id, day: input.day };
  },
};
