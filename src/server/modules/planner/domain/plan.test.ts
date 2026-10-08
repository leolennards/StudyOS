import { describe, expect, it } from "vitest";
import { buildPlan, formatMinutes, minutesOn, type PlanInput, reviewMinutes, topicNeed } from "./plan";

// 2026-10-12 is a Monday.
const MONDAY = "2026-10-12";
const week = (minutes: number) => [minutes, minutes, minutes, minutes, minutes, minutes, minutes];

function plan(input: Partial<PlanInput>) {
  return buildPlan({
    today: MONDAY,
    weekMinutes: week(60),
    reviewCards: new Map(),
    exams: [],
    assignments: [],
    ...input,
  });
}

describe("topicNeed", () => {
  it("takes the larger of what the student says and what the scores show", () => {
    expect(topicNeed({ confidence: null, recall: null })).toBe(1);
    expect(topicNeed({ confidence: 1, recall: 0.95 })).toBe(1);
    expect(topicNeed({ confidence: 2, recall: null })).toBe(0.6);
    expect(topicNeed({ confidence: 3, recall: 0.9, quizScore: 0.95 })).toBe(0.25);
    // Confident, but only 30% on past papers.
    expect(topicNeed({ confidence: 3, recall: 0.9, paperScore: 0.3 })).toBeCloseTo(0.7);
  });

  it("never drops below 0.2, so confident topics still come round", () => {
    expect(topicNeed({ confidence: 3, recall: 1, quizScore: 1, paperScore: 1 })).toBe(0.25);
  });
});

describe("reviewMinutes", () => {
  it("allows ten seconds a card, and at least five minutes", () => {
    expect(reviewMinutes(0)).toBe(0);
    expect(reviewMinutes(3)).toBe(5);
    expect(reviewMinutes(120)).toBe(20);
  });
});

describe("minutesOn", () => {
  it("reads the weekly pattern, Monday first", () => {
    const pattern = [10, 20, 30, 40, 50, 60, 70];
    expect(minutesOn(MONDAY, pattern)).toBe(10);
    expect(minutesOn("2026-10-18", pattern)).toBe(70);
  });
});

describe("formatMinutes", () => {
  it("uses hours from an hour up", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(90)).toBe("1 h 30 min");
  });
});

describe("buildPlan", () => {
  it("plans flashcards first, sized to the cards due", () => {
    const items = plan({ reviewCards: new Map([[MONDAY, 60]]) });
    expect(items.filter((i) => i.day === MONDAY)).toEqual([
      { day: MONDAY, kind: "review", minutes: 10, deadlineId: null, topicId: null, paperId: null, cards: 60 },
    ]);
  });

  it("fills the rest of each day with topic blocks, weakest and soonest first, and stops on the exam's day", () => {
    const items = plan({
      exams: [
        {
          id: "physics",
          dueOn: "2026-10-15",
          topics: [
            { topicId: "waves", need: 1 },
            { topicId: "optics", need: 0.25 },
          ],
          papers: [],
        },
      ],
    });
    const monday = items.filter((i) => i.day === MONDAY);
    expect(monday.map((i) => [i.kind, i.topicId, i.minutes])).toEqual([
      ["topic", "waves", 30],
      ["topic", "optics", 30],
    ]);
    // The exam is on Thursday: nothing for it that day or after.
    expect(items.filter((i) => i.day >= "2026-10-15")).toEqual([]);
  });

  it("spreads time over topics instead of repeating the weakest one", () => {
    const items = plan({
      weekMinutes: week(30),
      exams: [
        {
          id: "maths",
          dueOn: "2026-10-30",
          topics: [
            { topicId: "algebra", need: 1 },
            { topicId: "geometry", need: 0.8 },
            { topicId: "calculus", need: 0.6 },
          ],
          papers: [],
        },
      ],
    });
    expect(items.map((i) => i.topicId)).toEqual([
      "algebra",
      "geometry",
      "calculus",
      "algebra",
      "geometry",
      "calculus",
      "algebra",
    ]);
  });

  it("gives a sooner exam more of the time than a later one", () => {
    const items = plan({
      exams: [
        { id: "soon", dueOn: "2026-10-16", topics: [{ topicId: "a", need: 0.6 }], papers: [] },
        { id: "later", dueOn: "2026-11-20", topics: [{ topicId: "b", need: 1 }], papers: [] },
      ],
    });
    expect(items[0]).toMatchObject({ day: MONDAY, deadlineId: "soon", topicId: "a" });
  });

  it("plans a topic once a day even when two exams cover it", () => {
    const items = plan({
      weekMinutes: week(90),
      exams: [
        { id: "midterm", dueOn: "2026-10-20", topics: [{ topicId: "waves", need: 1 }], papers: [] },
        { id: "final", dueOn: "2026-11-20", topics: [{ topicId: "waves", need: 1 }], papers: [] },
      ],
    });
    expect(items.filter((i) => i.day === MONDAY)).toHaveLength(1);
  });

  it("revises an exam with no topics as a whole", () => {
    const items = plan({ exams: [{ id: "history", dueOn: "2026-10-20", topics: [], papers: [] }] });
    expect(items[0]).toMatchObject({ kind: "topic", deadlineId: "history", topicId: null, minutes: 30 });
  });

  it("sits a past paper on one of the three days before an exam, and never the same paper twice", () => {
    const items = plan({
      weekMinutes: week(120),
      exams: [
        {
          id: "physics",
          dueOn: "2026-10-16",
          topics: [{ topicId: "waves", need: 1 }],
          papers: [
            { id: "june-2023", minutes: 90 },
            { id: "june-2022", minutes: null },
          ],
        },
      ],
    });
    const papers = items.filter((i) => i.kind === "paper");
    expect(papers.map((i) => [i.day, i.paperId, i.minutes])).toEqual([
      ["2026-10-13", "june-2023", 90],
      ["2026-10-14", "june-2022", 60],
    ]);
    // Monday is four days out: topics only.
    expect(items.filter((i) => i.day === MONDAY).every((i) => i.kind === "topic")).toBe(true);
  });

  it("skips a paper that doesn't fit the day", () => {
    const items = plan({
      exams: [{ id: "physics", dueOn: "2026-10-14", topics: [], papers: [{ id: "long", minutes: 150 }] }],
    });
    expect(items.some((i) => i.kind === "paper")).toBe(false);
  });

  it("gives an assignment a block on each of the three days before it is due", () => {
    const items = plan({ assignments: [{ id: "essay", dueOn: "2026-10-16" }] });
    expect(items.filter((i) => i.kind === "assignment").map((i) => i.day)).toEqual([
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]);
  });

  it("leaves rest days empty and counts time already spent", () => {
    const items = plan({
      weekMinutes: [60, 0, 60, 60, 60, 60, 60],
      done: [{ day: MONDAY, minutes: 45, kind: "review", deadlineId: null, topicId: null }],
      exams: [{ id: "maths", dueOn: "2026-10-30", topics: [{ topicId: "algebra", need: 1 }], papers: [] }],
    });
    expect(items.filter((i) => i.day === MONDAY).map((i) => i.minutes)).toEqual([15]);
    expect(items.some((i) => i.day === "2026-10-13")).toBe(false);
  });

  it("doesn't plan a topic again on the day it was studied", () => {
    const items = plan({
      exams: [
        {
          id: "maths",
          dueOn: "2026-10-30",
          topics: [
            { topicId: "algebra", need: 1 },
            { topicId: "geometry", need: 0.3 },
          ],
          papers: [],
        },
      ],
      done: [{ day: MONDAY, minutes: 30, kind: "topic", deadlineId: "maths", topicId: "algebra" }],
    });
    expect(items.filter((i) => i.day === MONDAY).map((i) => i.topicId)).toEqual(["geometry"]);
  });

  it("is the same every time for the same input", () => {
    const input: Partial<PlanInput> = {
      reviewCards: new Map([[MONDAY, 30]]),
      exams: [
        { id: "a", dueOn: "2026-10-20", topics: [{ topicId: "x", need: 0.6 }], papers: [] },
        { id: "b", dueOn: "2026-10-20", topics: [{ topicId: "y", need: 0.6 }], papers: [] },
      ],
    };
    expect(plan(input)).toEqual(plan(input));
    expect(plan(input).find((i) => i.kind === "topic")?.topicId).toBe("x");
  });
});
