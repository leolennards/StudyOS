import { addDays, daysBetween, type DateKey, weekday } from "@/server/modules/progress/domain/calendar";
import type { ConfidenceLevel, TopicStanding } from "./exams";

/**
 * Weekly study plan rules (Architecture §28). Pure: no database, no clock.
 *
 * The plan is worked out by a greedy scheduler, not a model, so the same
 * exams, scores and free time always give the same plan, and every item can
 * be explained: flashcards that fall due that day, past papers in the last
 * few days before an exam, assignments in the days before they are due, and
 * the rest of the time on the topics that most need it, sooner exams first.
 */

export const PLAN_ITEM_KINDS = ["review", "topic", "paper", "assignment"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export const PLAN_ITEM_STATUSES = ["todo", "done", "skipped"] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];

export const PLAN_LIMITS = {
  /** Days a plan covers, today included. */
  days: 7,
  /** Most study minutes the student can give a single day. */
  minutesPerDay: 720,
  /** A topic or assignment block. */
  blockMinutes: 30,
  /** Time left in a day shorter than this isn't worth another block. */
  minBlockMinutes: 15,
  /** A flashcard block is never shorter than this. */
  minReviewMinutes: 5,
  /** Past papers are planned this many days before an exam, at most. */
  paperDaysBefore: 3,
  /** Assignments get time on this many days before they are due. */
  assignmentDaysBefore: 3,
  /** Paper length assumed when the paper doesn't say. */
  defaultPaperMinutes: 60,
} as const;

/** Rough time per flashcard, used to size the review block. */
export const SECONDS_PER_CARD = 10;

/** Free minutes on each day of the week, Monday first, before the student sets their own. */
export const DEFAULT_WEEK_MINUTES = [60, 60, 60, 60, 60, 90, 90] as const;

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/**
 * How much a topic needs work, from 0.2 (confident and scoring well) to 1
 * (rated "not yet", never rated, or scoring nothing): the larger of what
 * the student says and what their recall, quiz and past-paper scores show.
 */
export function topicNeed(t: Pick<TopicStanding, "confidence" | "recall" | "quizScore" | "paperScore">): number {
  const said: Record<ConfidenceLevel, number> = { 1: 1, 2: 0.6, 3: 0.25 };
  const fromConfidence = t.confidence ? said[t.confidence] : 1;
  const known = [t.recall, t.quizScore, t.paperScore].filter((v): v is number => v !== null && v !== undefined);
  const fromScores = known.length > 0 ? 1 - Math.min(...known) : 0;
  return Math.max(0.2, fromConfidence, fromScores);
}

/** Minutes for a flashcard block of this many cards. */
export function reviewMinutes(cards: number): number {
  if (cards <= 0) return 0;
  return Math.max(PLAN_LIMITS.minReviewMinutes, Math.ceil((cards * SECONDS_PER_CARD) / 60));
}

export type PlanExam = {
  id: string;
  dueOn: DateKey;
  /** The topics it covers, in the order to work on them, with how much each needs work. */
  topics: { topicId: string; need: number }[];
  /** Its subject's past papers, the ones to sit first first. */
  papers: { id: string; minutes: number | null }[];
};

export type PlanInput = {
  today: DateKey;
  /** Free minutes on each day of the week, Monday first. */
  weekMinutes: readonly number[];
  /**
   * Plan items already finished from today on. Their time counts against
   * their day, and their topics count as planned, so a topic just studied
   * isn't planned again the same day.
   */
  done?: { day: DateKey; minutes: number; deadlineId: string | null; topicId: string | null; kind: PlanItemKind }[];
  /** Flashcards expected each day. */
  reviewCards: ReadonlyMap<DateKey, number>;
  /** Exams and tests that haven't happened yet. */
  exams: PlanExam[];
  /** Assignments that aren't due yet. */
  assignments: { id: string; dueOn: DateKey }[];
};

export type PlannedItem = {
  day: DateKey;
  kind: PlanItemKind;
  minutes: number;
  deadlineId: string | null;
  topicId: string | null;
  paperId: string | null;
  /** Flashcards expected, for a review block. */
  cards: number | null;
};

/** The days a plan covers, starting today. */
export function planDays(today: DateKey): DateKey[] {
  return Array.from({ length: PLAN_LIMITS.days }, (_, i) => addDays(today, i));
}

/** Free minutes on a day, from the weekly pattern. */
export function minutesOn(day: DateKey, weekMinutes: readonly number[]): number {
  return weekMinutes[weekday(day)] ?? 0;
}

/**
 * Builds a week's plan. For each day, in order, it fits into the free time:
 * the flashcards due that day; one past paper when an exam is one to three
 * days away; a block for each assignment due in the next three days; then
 * topic blocks, highest priority first. A topic's priority is how much it
 * needs work divided by the days left until its exam, and halves each time
 * it is planned, so time spreads across topics instead of piling onto one.
 * A topic is planned at most once a day, and never on or after its exam's day.
 */
export function buildPlan(input: PlanInput): PlannedItem[] {
  const items: PlannedItem[] = [];
  const planned = new Map<string, number>();
  const papersUsed = new Set<string>();
  const papersByExam = new Map(input.exams.map((e) => [e.id, [...e.papers]]));
  const used = new Map<DateKey, number>();
  const studied = new Map<DateKey, Set<string>>();
  for (const d of input.done ?? []) {
    used.set(d.day, (used.get(d.day) ?? 0) + d.minutes);
    if (d.kind !== "topic" || !d.deadlineId) continue;
    const key = `${d.deadlineId}:${d.topicId ?? ""}`;
    planned.set(key, (planned.get(key) ?? 0) + 1);
    const set = studied.get(d.day) ?? new Set<string>();
    set.add(key);
    if (d.topicId) set.add(d.topicId);
    studied.set(d.day, set);
  }

  for (const day of planDays(input.today)) {
    let left = minutesOn(day, input.weekMinutes) - (used.get(day) ?? 0);
    const add = (item: Omit<PlannedItem, "day">) => {
      items.push({ day, ...item });
      left -= item.minutes;
    };
    if (left < PLAN_LIMITS.minReviewMinutes) continue;

    const cards = input.reviewCards.get(day) ?? 0;
    if (cards > 0) {
      add({
        kind: "review",
        minutes: Math.min(reviewMinutes(cards), left),
        deadlineId: null,
        topicId: null,
        paperId: null,
        cards,
      });
    }

    // One past paper a day, for the soonest exam one to three days away that has a paper left.
    const paperExams = input.exams
      .filter((e) => {
        const d = daysBetween(day, e.dueOn);
        return d >= 1 && d <= PLAN_LIMITS.paperDaysBefore;
      })
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    for (const exam of paperExams) {
      const papers = papersByExam.get(exam.id) ?? [];
      const paper = papers.find((p) => !papersUsed.has(p.id));
      if (!paper) continue;
      const minutes = paper.minutes ?? PLAN_LIMITS.defaultPaperMinutes;
      if (minutes > left) continue;
      papersUsed.add(paper.id);
      add({ kind: "paper", minutes, deadlineId: exam.id, topicId: null, paperId: paper.id, cards: null });
      break;
    }

    for (const a of [...input.assignments].sort((x, y) => x.dueOn.localeCompare(y.dueOn))) {
      const d = daysBetween(day, a.dueOn);
      if (d < 1 || d > PLAN_LIMITS.assignmentDaysBefore || left < PLAN_LIMITS.minBlockMinutes) continue;
      add({
        kind: "assignment",
        minutes: Math.min(PLAN_LIMITS.blockMinutes, left),
        deadlineId: a.id,
        topicId: null,
        paperId: null,
        cards: null,
      });
    }

    // Everything an exam still ahead of this day covers. An exam with no
    // topics is one block of general revision.
    const candidates = input.exams
      .filter((e) => daysBetween(day, e.dueOn) >= 1)
      .flatMap((e, examIndex) => {
        const days = daysBetween(day, e.dueOn);
        const topics = e.topics.length > 0 ? e.topics : [{ topicId: null, need: 1 }];
        return topics.map((t, topicIndex) => ({
          examId: e.id,
          dueOn: e.dueOn,
          topicId: t.topicId,
          key: `${e.id}:${t.topicId ?? ""}`,
          need: t.need,
          days,
          order: examIndex * 10_000 + topicIndex,
        }));
      });
    const today = new Set<string>(studied.get(day));
    while (left >= PLAN_LIMITS.minBlockMinutes) {
      let best: (typeof candidates)[number] | null = null;
      let bestScore = 0;
      for (const c of candidates) {
        // The same topic can come up under two exams; it is planned once a day.
        if (today.has(c.key) || (c.topicId && today.has(c.topicId))) continue;
        const score = (c.need * 0.5 ** (planned.get(c.key) ?? 0)) / c.days;
        if (
          !best ||
          score > bestScore ||
          (score === bestScore && (c.dueOn < best.dueOn || (c.dueOn === best.dueOn && c.order < best.order)))
        ) {
          best = c;
          bestScore = score;
        }
      }
      if (!best) break;
      today.add(best.key);
      if (best.topicId) today.add(best.topicId);
      planned.set(best.key, (planned.get(best.key) ?? 0) + 1);
      add({
        kind: "topic",
        minutes: Math.min(PLAN_LIMITS.blockMinutes, left),
        deadlineId: best.examId,
        topicId: best.topicId,
        paperId: null,
        cards: null,
      });
    }
  }
  return items;
}

/** "45 min", "1 h", "1 h 30 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
