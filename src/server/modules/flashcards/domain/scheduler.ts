import { type Card, fsrs, type FSRS, type Grade, State } from "ts-fsrs";
import { DEFAULT_RETENTION } from "./limits";

/**
 * Spaced-repetition scheduling (Architecture §21, ADR-012): FSRS through the
 * open-source `ts-fsrs` library with its default parameters. Pure functions
 * of (state, rating, time), shared by the server, which is the authority,
 * and the review screen, which uses them to show intervals on the buttons
 * and to move to the next card without waiting.
 */

export type LearningState = "new" | "learning" | "review" | "relearning";

/** One item's memory state, as stored in `card_states`. */
export type MemoryState = {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: LearningState;
  lastReview: Date | null;
};

export type Rating = 1 | 2 | 3 | 4;

export const RATINGS: { value: Rating; label: string; key: string }[] = [
  { value: 1, label: "Again", key: "1" },
  { value: 2, label: "Hard", key: "2" },
  { value: 3, label: "Good", key: "3" },
  { value: 4, label: "Easy", key: "4" },
];

export const isRating = (n: unknown): n is Rating => n === 1 || n === 2 || n === 3 || n === 4;

const TO_FSRS: Record<LearningState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const FROM_FSRS: Record<State, LearningState> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const schedulers = new Map<number, FSRS>();

/** One scheduler per desired retention: fuzz spreads reviews out, and the 1 m / 10 m learning steps apply. */
function scheduler(retention: number): FSRS {
  const key = Math.round(retention * 1000) / 1000;
  let s = schedulers.get(key);
  if (!s) {
    s = fsrs({ request_retention: key, enable_fuzz: true, enable_short_term: true });
    schedulers.set(key, s);
  }
  return s;
}

function toCard(s: MemoryState): Card {
  return {
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: TO_FSRS[s.state],
    last_review: s.lastReview ?? undefined,
  };
}

function fromCard(c: Card): MemoryState {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: FROM_FSRS[c.state],
    lastReview: c.last_review ?? null,
  };
}

/** A new item, due straight away. */
export function newMemoryState(now: Date): MemoryState {
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: "new",
    lastReview: null,
  };
}

/** Whole days since the item was last reviewed (0 for a new item). */
export function elapsedDays(state: MemoryState, now: Date): number {
  if (!state.lastReview) return 0;
  return Math.max(0, Math.floor((now.getTime() - state.lastReview.getTime()) / DAY_MS));
}

/** The state after rating an item at `now`. */
export function schedule(
  state: MemoryState,
  rating: Rating,
  now: Date,
  opts: { retention?: number } = {},
): MemoryState {
  const next = scheduler(opts.retention ?? DEFAULT_RETENTION).next(toCard(state), now, rating as Grade);
  return fromCard(next.card);
}

/** When the item would next be due for each rating, for the labels on the rating buttons. */
export function previewDue(state: MemoryState, now: Date, opts: { retention?: number } = {}): Record<Rating, Date> {
  const preview = scheduler(opts.retention ?? DEFAULT_RETENTION).repeat(toCard(state), now);
  return { 1: preview[1].card.due, 2: preview[2].card.due, 3: preview[3].card.due, 4: preview[4].card.due };
}

/**
 * FSRS's estimate of the probability the student would recall the item now
 * (0 to 1), or null for an item never reviewed.
 */
export function retrievability(state: MemoryState, now: Date, opts: { retention?: number } = {}): number | null {
  if (state.state === "new") return null;
  return scheduler(opts.retention ?? DEFAULT_RETENTION).get_retrievability(toCard(state), now, false);
}

/** A compact interval for buttons and lists: "1m", "10m", "3h", "4d", "2mo", "1.5y". */
export function formatInterval(from: Date, to: Date): string {
  const minutes = Math.max(0, (to.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${years}y`;
}
