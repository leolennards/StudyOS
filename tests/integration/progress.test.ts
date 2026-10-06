import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { progressService } from "@/server/modules/progress/service";
import { settingsService } from "@/server/modules/settings/service";
import { closeDb } from "@/server/platform/db/client";
import { createTestUser, resetDatabase } from "../helpers/db";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;
let topicId: string;

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "OK";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

const NOW = new Date("2026-10-06T15:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

/** A focus session ending at `end`, `minutes` long. */
function focus(minutes: number, end: Date, extra: { subjectId?: string | null; sessionId?: string } = {}) {
  return progressService.logFocusSession(
    student,
    {
      sessionId: extra.sessionId ?? newId(),
      subjectId: extra.subjectId === undefined ? subjectId : extra.subjectId,
      startedAt: new Date(end.getTime() - minutes * 60_000),
      endedAt: end,
      focusedSeconds: minutes * 60,
    },
    // Old sessions are refused relative to "now", so log each as if just finished.
    new Date(end.getTime() + 1000),
  );
}

async function card(topicIds: string[] = [topicId]) {
  const { id } = await flashcardsService.createCard(student, {
    subjectId,
    type: "basic",
    front: `Q ${newId()}`,
    back: "A",
    topicIds,
  });
  return id;
}

const rate = (cardId: string, rating: 1 | 2 | 3 | 4, at: Date, durationMs = 30_000) =>
  flashcardsService.reviewCard(student, { reviewId: newId(), cardId, ordinal: 0, rating, durationMs }, at);

beforeEach(async () => {
  await resetDatabase();
  student = await createTestUser();
  ({ id: subjectId } = await knowledgeService.createSubject(student, {
    name: "Biology",
    code: null,
    term: null,
    description: null,
    colour: "emerald",
  }));
  ({ id: topicId } = await knowledgeService.createTopic(student, {
    subjectId,
    sectionId: null,
    name: "Cells",
    description: null,
  }));
});

afterAll(async () => {
  await closeDb();
});

describe("focus sessions", () => {
  it("records a session once, however often it is saved", async () => {
    const sessionId = newId();
    const first = await focus(25, hoursAgo(1), { sessionId });
    const again = await focus(25, hoursAgo(1), { sessionId });
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    const habits = await progressService.getHabits(student, NOW);
    expect(habits.todaySeconds).toBe(25 * 60);
    expect(habits.todaySessions).toBe(1);
  });

  it("refuses sessions that can't be real", async () => {
    const start = hoursAgo(1);
    const log = (input: Partial<Parameters<typeof progressService.logFocusSession>[1]>) =>
      code(() =>
        progressService.logFocusSession(
          student,
          {
            sessionId: newId(),
            subjectId,
            startedAt: start,
            endedAt: new Date(start.getTime() + 10 * 60_000),
            focusedSeconds: 600,
            ...input,
          },
          NOW,
        ),
      );
    expect(await log({ focusedSeconds: 3600 })).toBe("VALIDATION");
    expect(await log({ endedAt: new Date(NOW.getTime() + 3_600_000) })).toBe("VALIDATION");
    expect(await log({ startedAt: daysAgo(10), endedAt: daysAgo(10) })).toBe("VALIDATION");
    expect(await log({ subjectId: newId() })).toBe("NOT_FOUND");
    expect(await log({})).toBe("OK");
  });

  it("can't use another workspace's subject or session id", async () => {
    const other = await createTestUser("Other");
    const sessionId = newId();
    await focus(20, hoursAgo(2), { sessionId });
    const save = (input: { subjectId: string | null; sessionId: string }) =>
      code(() =>
        progressService.logFocusSession(
          other,
          { ...input, startedAt: hoursAgo(3), endedAt: hoursAgo(2.5), focusedSeconds: 1200 },
          NOW,
        ),
      );
    expect(await save({ subjectId, sessionId: newId() })).toBe("NOT_FOUND");
    expect(await save({ subjectId: null, sessionId })).toBe("CONFLICT");
    expect((await progressService.getHabits(other, NOW)).todaySeconds).toBe(0);
  });

  it("refuses writes from a viewer", async () => {
    expect(await code(() => focus(20, hoursAgo(1)).then(() => undefined))).toBe("OK");
    const viewer = { ...student, role: "viewer" as const };
    expect(
      await code(() =>
        progressService.logFocusSession(
          viewer,
          { sessionId: newId(), subjectId: null, startedAt: hoursAgo(2), endedAt: hoursAgo(1.5), focusedSeconds: 600 },
          NOW,
        ),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("study time, goal and streak", () => {
  it("adds focus time and flashcard time, without counting a review twice", async () => {
    const id = await card();
    // A review on its own counts its time on screen…
    await rate(id, 3, hoursAgo(5), 40_000);
    // …a review inside a focus session adds nothing more…
    await focus(30, hoursAgo(1));
    const second = await card();
    await rate(second, 3, hoursAgo(1.2), 40_000);
    // …and a card left on screen counts for two minutes at most.
    const third = await card();
    await rate(third, 3, hoursAgo(4), 30 * 60_000);

    const habits = await progressService.getHabits(student, NOW);
    expect(habits.todaySeconds).toBe(40 + 30 * 60 + 120);
    expect(habits.todayFocusSeconds).toBe(30 * 60);
    expect(habits.goalMinutes).toBe(30);
    expect(habits.goalMet).toBe(true);
  });

  it("follows the student's goal setting", async () => {
    await settingsService.update(student, { dailyGoalMinutes: 60 });
    await focus(45, hoursAgo(1));
    const habits = await progressService.getHabits(student, NOW);
    expect(habits.goalMinutes).toBe(60);
    expect(habits.goalMet).toBe(false);
  });

  it("counts a streak of days with any study, in the student's time zone", async () => {
    await settingsService.update(student, { timezone: "Pacific/Auckland" });
    // 2026-10-06T15:00Z is 04:00 on 7 October in Auckland.
    await focus(10, daysAgo(1)); // 6 Oct, 03:00 local
    await focus(10, daysAgo(2)); // 5 Oct
    const id = await card();
    await rate(id, 3, daysAgo(3)); // 4 Oct
    await focus(10, daysAgo(6)); // 1 Oct, two days before the streak began

    const habits = await progressService.getHabits(student, NOW);
    expect(habits.today).toBe("2026-10-07");
    expect(habits.studiedToday).toBe(false);
    expect(habits.streak).toBe(3);
    expect(habits.longestStreak).toBe(3);
    expect(habits.week.map((d) => d.seconds > 0)).toEqual([true, false, false, true, true, true, false]);
  });
});

describe("progress page", () => {
  it("reports recall, weak topics, time per subject and the review forecast", async () => {
    const { id: weakTopic } = await knowledgeService.createTopic(student, {
      subjectId,
      sectionId: null,
      name: "Genetics",
      description: null,
    });
    // Learn twelve cards about Cells and five about Genetics, then review them a few days later.
    const strong = await Promise.all(Array.from({ length: 12 }, () => card([topicId])));
    const weak = await Promise.all(Array.from({ length: 5 }, () => card([weakTopic])));
    for (const id of [...strong, ...weak]) await rate(id, 4, daysAgo(20));
    for (const id of strong) await rate(id, 3, daysAgo(2));
    for (const [i, id] of weak.entries()) await rate(id, i < 3 ? 1 : 3, daysAgo(2));
    await focus(25, hoursAgo(3), { subjectId: null });

    const progress = await progressService.getProgress(student, NOW);
    expect(progress.recall.reviews).toBe(17);
    expect(progress.recall.remembered).toBe(14);
    expect(progress.recall.rate).toBeCloseTo(14 / 17);
    expect(progress.weakTopics[0]).toMatchObject({ topicName: "Genetics", ratings: 5, forgot: 3 });
    expect(progress.weakTopics.map((t) => t.topicName)).toEqual(["Genetics", "Cells"]);
    expect(progress.subjectTime.map((s) => s.name)).toEqual([null, "Biology"]);
    expect(progress.subjectTime[0]!.seconds).toBe(25 * 60);
    expect(progress.forecast).toHaveLength(7);
    expect(progress.forecast[0]!.day).toBe("2026-10-06");
    expect(progress.forecast.reduce((t, d) => t + d.items, 0)).toBeGreaterThan(0);
    expect(progress.heatmap.length % 7).toBe(0);
    expect(progress.heatmap.find((d) => d.day === "2026-10-06")!.seconds).toBeGreaterThan(0);
    expect(progress.lastWeek.ratings).toBe(17);
  });

  it("leaves out archived subjects", async () => {
    const id = await card();
    await rate(id, 3, hoursAgo(2));
    await knowledgeService.setSubjectArchived(student, { id: subjectId, archived: true });
    const progress = await progressService.getProgress(student, NOW);
    expect(progress.subjectTime).toEqual([]);
    expect(progress.forecast.every((d) => d.items === 0)).toBe(true);
  });
});
