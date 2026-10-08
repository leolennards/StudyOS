import type { CardType } from "./domain/items";
import type { OcclusionBox } from "./domain/occlusion";
import type { LearningState } from "./domain/scheduler";

/** One item of a review session as the browser receives it: dates as ISO strings. */
export type SessionItem = {
  cardId: string;
  subjectId: string;
  ordinal: number;
  type: CardType;
  front: string;
  back: string;
  frontImageId: string | null;
  backImageId: string | null;
  occlusions: OcclusionBox[] | null;
  memory: {
    due: string;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    learningSteps: number;
    reps: number;
    lapses: number;
    state: LearningState;
    lastReview: string | null;
  };
};

export type ClientSession = { items: SessionItem[]; retention: number; more: boolean; nextDue: string | null };

type ServerSession = {
  items: (Omit<SessionItem, "memory"> & {
    memory: Omit<SessionItem["memory"], "due" | "lastReview"> & { due: Date; lastReview: Date | null };
  })[];
  retention: number;
  more: boolean;
  overview: { nextDue: Date | null };
};

/** Dates become ISO strings on their way to the browser, as everywhere else in the app. */
export function toClientSession(session: ServerSession): ClientSession {
  return {
    items: session.items.map((i) => ({
      ...i,
      memory: { ...i.memory, due: i.memory.due.toISOString(), lastReview: i.memory.lastReview?.toISOString() ?? null },
    })),
    retention: session.retention,
    more: session.more,
    nextDue: session.overview.nextDue?.toISOString() ?? null,
  };
}
