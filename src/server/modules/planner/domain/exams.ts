import { daysBetween, type DateKey } from "@/server/modules/progress/domain/calendar";

/** Exam planner rules (Architecture §28). Pure: no database, no clock. */

export const DEADLINE_KINDS = ["exam", "test", "assignment"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export const KIND_LABELS: Record<DeadlineKind, string> = {
  exam: "Exam",
  test: "Test",
  assignment: "Assignment",
};

export const PLANNER_LIMITS = {
  title: 120,
  location: 120,
  /** How far ahead a date may be, in days. */
  daysAhead: 3 * 366,
  /** How far back a date may be, in days, so past exams can still be corrected. */
  daysBack: 366,
  /** Topics one exam can list. */
  topics: 500,
} as const;

/** How confident the student says they are in a topic. */
export const CONFIDENCE_LEVELS = [1, 2, 3] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  1: "Not yet",
  2: "Getting there",
  3: "Confident",
};

/** Whole days from today until the date: 0 today, negative once it has passed. */
export function daysUntil(today: DateKey, dueOn: DateKey): number {
  return daysBetween(today, dueOn);
}

/** "Today", "Tomorrow", "In 12 days", "Yesterday", "3 days ago". */
export function countdownLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${-days} days ago`;
}

export type Readiness = {
  total: number;
  confident: number;
  gettingThere: number;
  notYet: number;
  unrated: number;
  /**
   * 0 to 1: confident topics count fully, "getting there" half, the rest
   * nothing. Null when there are no topics to judge by.
   */
  score: number | null;
};

/** How ready the student says they are, from their confidence in each topic. */
export function readiness(levels: (ConfidenceLevel | null)[]): Readiness {
  const count = (level: ConfidenceLevel | null) => levels.filter((l) => l === level).length;
  const confident = count(3);
  const gettingThere = count(2);
  const total = levels.length;
  return {
    total,
    confident,
    gettingThere,
    notYet: count(1),
    unrated: count(null),
    score: total === 0 ? null : (confident + gettingThere / 2) / total,
  };
}

export type TopicStanding = {
  topicId: string;
  confidence: ConfidenceLevel | null;
  /** Share of reviews remembered recently, or null with too few to say. */
  recall: number | null;
  /** Share of quiz questions answered right recently, or null with none. */
  quizScore?: number | null;
};

/** The weaker of a topic's review recall and quiz score, whichever are known; 1 when neither is. */
function evidence(t: TopicStanding): number {
  const known = [t.recall, t.quizScore].filter((v): v is number => v !== null && v !== undefined);
  return known.length > 0 ? Math.min(...known) : 1;
}

/**
 * The order to work on topics before an exam: lowest confidence first
 * (unrated counts as lowest, since nothing is known), then the ones the
 * student did worst on, in review or in quizzes. Ties keep their original order.
 */
export function workOrder<T extends TopicStanding>(topics: T[]): T[] {
  return topics
    .map((topic, index) => ({ topic, index }))
    .sort((a, b) => {
      const ca = a.topic.confidence ?? 0;
      const cb = b.topic.confidence ?? 0;
      if (ca !== cb) return ca - cb;
      const ra = evidence(a.topic);
      const rb = evidence(b.topic);
      if (ra !== rb) return ra - rb;
      return a.index - b.index;
    })
    .map((x) => x.topic);
}
