import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { AppError } from "@/server/lib/errors";
import { getDb } from "@/server/platform/db/client";
import { endOfDay, startOfDay } from "@/server/modules/flashcards/domain/day";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { settingsService } from "@/server/modules/settings/service";
import { addDays, dateKey, type DateKey, dateRange, startOfWeek } from "./domain/calendar";
import { FORECAST_DAYS, HEATMAP_WEEKS, INSIGHT_WINDOW_DAYS, WEAK_TOPIC_MIN_RATINGS } from "./domain/limits";
import { intensity, streaks } from "./domain/streaks";
import { progressRepository as repo } from "./repository";
import type { logFocusSessionSchema } from "./schemas";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Progress module (Architecture §28, §29): focus sessions, the daily goal,
 * streaks and the student's learning analytics. Nothing here is stored
 * twice: every figure is computed from focus sessions and flashcard
 * ratings, so it is always consistent with what actually happened.
 */

/** A focus session may end this far in the future, to allow for a browser clock that runs a little fast. */
const CLOCK_SKEW_MS = 5 * 60_000;
/** Sessions older than this are refused: a stale timer from another week isn't today's study. */
const SESSION_MAX_AGE_MS = 3 * 86_400_000;

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

export type DayStudy = { day: DateKey; seconds: number; level: 0 | 1 | 2 | 3 | 4 };

async function studyDays(ctx: RequestContext, now: Date) {
  const settings = await settingsService.get(ctx);
  const today = dateKey(now, settings.timezone);
  const rows = await repo.dailyStudy(getDb(), ctx.workspaceId, settings.timezone, null);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const active = rows.filter((r) => r.ratings + r.sessions > 0).map((r) => r.day);
  return { settings, today, byDay, ...streaks(active, today) };
}

export const progressService = {
  /** Saves a finished focus session. Saving the same session twice records it once. */
  async logFocusSession(ctx: RequestContext, input: In<typeof logFocusSessionSchema>, now = new Date()) {
    assertCanWrite(ctx);
    if (input.endedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
      throw new AppError("VALIDATION", "That session ends in the future. Check your device's clock.");
    }
    if (input.startedAt.getTime() < now.getTime() - SESSION_MAX_AGE_MS) {
      throw new AppError("VALIDATION", "That session is too old to save.");
    }
    const span = Math.ceil((input.endedAt.getTime() - input.startedAt.getTime()) / 1000);
    if (input.focusedSeconds > span + 5) {
      throw new AppError("VALIDATION", "A session can't be longer than the time between its start and end.");
    }
    if (input.subjectId) await knowledgeService.getSubject(ctx, input.subjectId);

    const recorded = await repo.insertSession(getDb(), {
      id: input.sessionId,
      workspaceId: ctx.workspaceId,
      subjectId: input.subjectId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      focusedSeconds: Math.min(input.focusedSeconds, span),
    });
    if (!recorded) {
      // A retry of a save that already went through, or an id from another workspace.
      const existing = await repo.findSession(getDb(), ctx.workspaceId, input.sessionId);
      if (!existing) throw new AppError("CONFLICT");
    }
    return { sessionId: input.sessionId, focusedSeconds: input.focusedSeconds, duplicate: !recorded };
  },

  /**
   * Today at a glance: study time against the daily goal, the streak, and
   * the last seven days. What Today, Focus and the end of a review show.
   */
  async getHabits(ctx: RequestContext, now = new Date()) {
    const { settings, today, byDay, current, longest, studiedToday } = await studyDays(ctx, now);
    const goal = settings.dailyGoalMinutes;
    const week: DayStudy[] = dateRange(addDays(today, -6), today).map((day) => {
      const seconds = byDay.get(day)?.seconds ?? 0;
      return { day, seconds, level: intensity(seconds, goal) };
    });
    const todayRow = byDay.get(today);
    return {
      today,
      goalMinutes: goal,
      todaySeconds: todayRow?.seconds ?? 0,
      todayFocusSeconds: todayRow?.focusSeconds ?? 0,
      todaySessions: todayRow?.sessions ?? 0,
      goalMet: (todayRow?.seconds ?? 0) >= goal * 60,
      streak: current,
      longestStreak: longest,
      studiedToday,
      week,
    };
  },

  /** Everything the Progress page shows. */
  async getProgress(ctx: RequestContext, now = new Date()) {
    const db = getDb();
    const { settings, today, byDay, current, longest, studiedToday } = await studyDays(ctx, now);
    const goal = settings.dailyGoalMinutes;
    const tz = settings.timezone;
    const windowStart = startOfDay(new Date(now.getTime() - (INSIGHT_WINDOW_DAYS - 1) * 86_400_000), tz);
    const forecastEnd = endOfDay(new Date(now.getTime() + (FORECAST_DAYS - 1) * 86_400_000), tz);

    const [subjectTime, recall, weakTopics, due] = await Promise.all([
      repo.subjectTime(db, ctx.workspaceId, windowStart),
      repo.recall(db, ctx.workspaceId, windowStart),
      repo.topicRecall(db, ctx.workspaceId, { since: windowStart, minRatings: WEAK_TOPIC_MIN_RATINGS, limit: 6 }),
      repo.dueByDay(db, ctx.workspaceId, { timeZone: tz, now, until: forecastEnd }),
    ]);

    // The heatmap runs in whole weeks, Monday to Sunday, ending this week.
    const heatmapStart = startOfWeek(addDays(today, -(HEATMAP_WEEKS - 1) * 7));
    const heatmap: (DayStudy & { future: boolean })[] = dateRange(heatmapStart, addDays(startOfWeek(today), 6)).map(
      (day) => {
        const seconds = byDay.get(day)?.seconds ?? 0;
        return { day, seconds, level: intensity(seconds, goal), future: day > today };
      },
    );

    const sumSeconds = (from: DateKey, to: DateKey) =>
      dateRange(from, to).reduce((total, day) => total + (byDay.get(day)?.seconds ?? 0), 0);
    const sumRatings = (from: DateKey, to: DateKey) =>
      dateRange(from, to).reduce((total, day) => total + (byDay.get(day)?.ratings ?? 0), 0);
    const daysAtGoal = dateRange(addDays(today, -6), today).filter(
      (day) => (byDay.get(day)?.seconds ?? 0) >= goal * 60,
    ).length;

    const dueByDay = new Map(due.map((d) => [d.day, d.items]));
    const forecast = dateRange(today, addDays(today, FORECAST_DAYS - 1)).map((day) => ({
      day,
      items: dueByDay.get(day) ?? 0,
    }));

    const totalSeconds = [...byDay.values()].reduce((t, r) => t + r.seconds, 0);

    return {
      today,
      timezone: tz,
      goalMinutes: goal,
      todaySeconds: byDay.get(today)?.seconds ?? 0,
      streak: current,
      longestStreak: longest,
      studiedToday,
      activeDays: [...byDay.values()].filter((r) => r.ratings + r.sessions > 0).length,
      totalSeconds,
      lastWeek: {
        seconds: sumSeconds(addDays(today, -6), today),
        previousSeconds: sumSeconds(addDays(today, -13), addDays(today, -7)),
        ratings: sumRatings(addDays(today, -6), today),
        daysAtGoal,
      },
      heatmap,
      windowDays: INSIGHT_WINDOW_DAYS,
      recall: {
        ...recall,
        /** Share of learned cards remembered, or null with too few reviews to say. */
        rate: recall.reviews >= 10 ? recall.remembered / recall.reviews : null,
        target: settings.desiredRetention,
      },
      subjectTime,
      weakTopics: weakTopics.map((t) => ({ ...t, recall: 1 - t.forgot / t.ratings })),
      forecast,
    };
  },
};
