import { describe, expect, it } from "vitest";
import {
  elapsedDays,
  formatInterval,
  newMemoryState,
  previewDue,
  retrievability,
  schedule,
  type Rating,
} from "./scheduler";

const t0 = new Date("2026-10-05T09:00:00Z");
const minutes = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;
const days = (from: Date, to: Date) => minutes(from, to) / (60 * 24);

describe("schedule", () => {
  it("takes a new card through the 1 and 10 minute learning steps", () => {
    const fresh = newMemoryState(t0);
    const again = schedule(fresh, 1, t0);
    expect(again.state).toBe("learning");
    expect(minutes(t0, again.due)).toBe(1);

    const good = schedule(fresh, 3, t0);
    expect(good.state).toBe("learning");
    expect(minutes(t0, good.due)).toBe(10);
    expect(good.reps).toBe(1);
    expect(good.lastReview).toEqual(t0);
  });

  it("graduates a learning card to review with an interval in days", () => {
    const step = schedule(newMemoryState(t0), 3, t0);
    const later = new Date(step.due);
    const graduated = schedule(step, 3, later);
    expect(graduated.state).toBe("review");
    expect(days(later, graduated.due)).toBeGreaterThanOrEqual(1);
  });

  it("sends Easy straight to review", () => {
    const easy = schedule(newMemoryState(t0), 4, t0);
    expect(easy.state).toBe("review");
    expect(days(t0, easy.due)).toBeGreaterThanOrEqual(1);
  });

  it("counts a lapse when a review card is forgotten", () => {
    let s = schedule(newMemoryState(t0), 4, t0);
    const reviewAt = new Date(s.due);
    s = schedule(s, 1, reviewAt);
    expect(s.state).toBe("relearning");
    expect(s.lapses).toBe(1);
    expect(minutes(reviewAt, s.due)).toBeLessThanOrEqual(10);
  });

  it("orders intervals Again < Hard < Good < Easy for a review card", () => {
    const review = schedule(newMemoryState(t0), 4, t0);
    const at = new Date(review.due);
    const due = previewDue(review, at);
    const order = ([1, 2, 3, 4] as Rating[]).map((r) => due[r].getTime());
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order[0]).toBeLessThan(order[3]!);
  });

  it("schedules longer intervals for a lower target retention", () => {
    const review = schedule(newMemoryState(t0), 4, t0, { retention: 0.9 });
    const at = new Date(review.due);
    const strict = schedule(review, 3, at, { retention: 0.95 });
    const relaxed = schedule(review, 3, at, { retention: 0.8 });
    expect(relaxed.due.getTime()).toBeGreaterThan(strict.due.getTime());
  });

  it("is a pure function of its inputs", () => {
    const review = schedule(newMemoryState(t0), 4, t0);
    const at = new Date(review.due);
    expect(schedule(review, 3, at)).toEqual(schedule(review, 3, at));
  });
});

describe("retrievability", () => {
  it("is unknown for a new card and falls as time passes", () => {
    expect(retrievability(newMemoryState(t0), t0)).toBeNull();
    const review = schedule(newMemoryState(t0), 4, t0);
    const soon = retrievability(review, new Date(t0.getTime() + 60_000))!;
    const later = retrievability(review, new Date(t0.getTime() + 30 * 86_400_000))!;
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeLessThanOrEqual(1);
    expect(later).toBeGreaterThan(0);
  });
});

describe("elapsedDays", () => {
  it("counts whole days since the last review", () => {
    const s = { ...newMemoryState(t0), lastReview: t0 };
    expect(elapsedDays(s, new Date(t0.getTime() + 36 * 3_600_000))).toBe(1);
    expect(elapsedDays(newMemoryState(t0), t0)).toBe(0);
  });
});

describe("formatInterval", () => {
  it("uses the largest sensible unit", () => {
    const at = (ms: number) => new Date(t0.getTime() + ms);
    expect(formatInterval(t0, at(30_000))).toBe("now");
    expect(formatInterval(t0, at(10 * 60_000))).toBe("10m");
    expect(formatInterval(t0, at(5 * 3_600_000))).toBe("5h");
    expect(formatInterval(t0, at(4 * 86_400_000))).toBe("4d");
    expect(formatInterval(t0, at(90 * 86_400_000))).toBe("3mo");
    expect(formatInterval(t0, at(548 * 86_400_000))).toBe("1.5y");
  });
});
