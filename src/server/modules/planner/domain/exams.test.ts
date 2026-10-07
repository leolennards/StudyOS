import { describe, expect, it } from "vitest";
import { countdownLabel, daysUntil, readiness, workOrder } from "./exams";

describe("countdown", () => {
  it("counts whole calendar days", () => {
    expect(daysUntil("2026-10-07", "2026-10-07")).toBe(0);
    expect(daysUntil("2026-10-07", "2026-10-08")).toBe(1);
    expect(daysUntil("2026-10-07", "2026-11-07")).toBe(31);
    expect(daysUntil("2026-10-07", "2026-10-05")).toBe(-2);
    // Across the clocks going back in Europe and the US.
    expect(daysUntil("2026-10-24", "2026-11-02")).toBe(9);
  });

  it("reads naturally", () => {
    expect(countdownLabel(0)).toBe("Today");
    expect(countdownLabel(1)).toBe("Tomorrow");
    expect(countdownLabel(12)).toBe("In 12 days");
    expect(countdownLabel(-1)).toBe("Yesterday");
    expect(countdownLabel(-3)).toBe("3 days ago");
  });
});

describe("readiness", () => {
  it("counts confident topics fully and partly-known ones by half", () => {
    const r = readiness([3, 3, 2, 1, null]);
    expect(r).toMatchObject({ total: 5, confident: 2, gettingThere: 1, notYet: 1, unrated: 1 });
    expect(r.score).toBeCloseTo(2.5 / 5);
  });

  it("has no score without topics", () => {
    expect(readiness([]).score).toBeNull();
  });

  it("is zero when nothing has been rated", () => {
    expect(readiness([null, null]).score).toBe(0);
  });
});

describe("workOrder", () => {
  it("puts the least confident topics first, then the most forgotten", () => {
    const order = workOrder([
      { topicId: "confident", confidence: 3, recall: 0.5 },
      { topicId: "unrated", confidence: null, recall: null },
      { topicId: "shaky-good-recall", confidence: 2, recall: 0.95 },
      { topicId: "shaky-poor-recall", confidence: 2, recall: 0.6 },
      { topicId: "not-yet", confidence: 1, recall: null },
    ]);
    expect(order.map((t) => t.topicId)).toEqual([
      "unrated",
      "not-yet",
      "shaky-poor-recall",
      "shaky-good-recall",
      "confident",
    ]);
  });

  it("keeps the original order for ties", () => {
    const order = workOrder([
      { topicId: "a", confidence: 2, recall: null },
      { topicId: "b", confidence: 2, recall: null },
    ]);
    expect(order.map((t) => t.topicId)).toEqual(["a", "b"]);
  });
});
