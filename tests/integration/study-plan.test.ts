import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { examsService } from "@/server/modules/exams/service";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { studyPlanService } from "@/server/modules/planner/plan-service";
import { plannerService } from "@/server/modules/planner/service";
import { closeDb } from "@/server/platform/db/client";
import { createTestUser, resetDatabase } from "../helpers/db";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;
let cells: string;
let genetics: string;
let ecology: string;

// Monday 12 October 2026, 09:00 UTC. The test user's time zone is UTC.
const NOW = new Date("2026-10-12T09:00:00Z");
const MONDAY = "2026-10-12";
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "OK";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

async function subject(ctx = student, name = "Biology") {
  const { id } = await knowledgeService.createSubject(ctx, {
    name,
    code: null,
    term: null,
    description: null,
    colour: "emerald",
  });
  return id;
}

async function topic(name: string, sId = subjectId, ctx = student) {
  const { id } = await knowledgeService.createTopic(ctx, { subjectId: sId, sectionId: null, name, description: null });
  return id;
}

const deadline = (
  dueOn: string,
  extra: Partial<Parameters<typeof plannerService.createDeadline>[1]> = {},
  ctx = student,
) =>
  plannerService.createDeadline(
    ctx,
    { kind: "exam", title: "Biology final", subjectId, dueOn, startsAt: null, location: null, ...extra },
    NOW,
  );

const week = (minutes: number) => [minutes, minutes, minutes, minutes, minutes, minutes, minutes];

async function items(ctx = student, now = NOW) {
  const { days } = await studyPlanService.getWeek(ctx, now);
  return days.flatMap((d) => d.items);
}

beforeEach(async () => {
  await resetDatabase();
  student = await createTestUser();
  subjectId = await subject();
  cells = await topic("Cells");
  genetics = await topic("Genetics");
  ecology = await topic("Ecology");
});

afterAll(async () => {
  await closeDb();
});

describe("making a plan", () => {
  it("starts with no plan, then plans the week with the default time", async () => {
    expect(await studyPlanService.getToday(student, NOW)).toBeNull();
    const before = await studyPlanService.getWeek(student, NOW);
    expect(before.hasWeek).toBe(false);
    expect(before.days.map((d) => d.day)[0]).toBe(MONDAY);
    expect(before.days.every((d) => !d.planned)).toBe(true);

    await deadline("2026-10-30");
    await studyPlanService.makePlan(student, NOW);

    const after = await studyPlanService.getWeek(student, NOW);
    expect(after.hasWeek).toBe(true);
    expect(after.startsOn).toBe(MONDAY);
    expect(after.days.every((d) => d.planned)).toBe(true);
    // 60 minutes on weekdays, 90 at the weekend: two or three topic blocks a day.
    expect(after.days.map((d) => d.items.length)).toEqual([2, 2, 2, 2, 2, 3, 3]);
    expect(after.days[0].minutes).toBe(60);
  });

  it("puts the topics that most need work first, sooner exams before later ones", async () => {
    await plannerService.setTopicConfidence(student, { topicId: cells, level: 3 });
    await plannerService.setTopicConfidence(student, { topicId: genetics, level: 1 });
    await plannerService.setTopicConfidence(student, { topicId: ecology, level: 2 });
    const chemistry = await subject(student, "Chemistry");
    const bonding = await topic("Bonding", chemistry);
    await deadline("2026-11-30", { title: "Chemistry final", subjectId: chemistry });
    const { id: biology } = await deadline("2026-10-16");
    await studyPlanService.saveWeek(student, { weekMinutes: week(60) }, NOW);

    const monday = (await items()).filter((i) => i.day === MONDAY);
    expect(monday.map((i) => [i.kind, i.topic?.name, i.deadline?.id])).toEqual([
      ["topic", "Genetics", biology],
      ["topic", "Ecology", biology],
    ]);
    expect(monday[0].subject?.name).toBe("Biology");
    // Nothing for Biology on its exam day or after.
    const all = await items();
    expect(all.filter((i) => i.deadline?.id === biology).every((i) => i.day < "2026-10-16")).toBe(true);
    expect(all.some((i) => i.topic?.id === bonding)).toBe(true);
  });

  it("leaves a day off empty and plans flashcards on the days they're due", async () => {
    await flashcardsService.createCard(student, { subjectId, type: "basic", front: "Q", back: "A", topicIds: [] });
    await studyPlanService.saveWeek(student, { weekMinutes: [30, 0, 30, 30, 30, 30, 30] }, NOW);

    const { days } = await studyPlanService.getWeek(student, NOW);
    expect(days[0].items.map((i) => [i.kind, i.cards, i.minutes])).toEqual([["review", 1, 5]]);
    expect(days[1]).toMatchObject({ free: 0, items: [] });
  });

  it("sits the subject's unsat past papers in the last days before the exam", async () => {
    const sat = await examsService.createPaper(student, { subjectId, title: "June 2023", year: 2023, durationMin: 90 });
    const fresh = await examsService.createPaper(student, { subjectId, title: "June 2022", year: 2022 });
    await examsService.logAttempt(
      student,
      { paperId: sat.id, takenOn: "2026-10-01", marks: [], score: 40, outOf: 80 },
      NOW,
    );
    await deadline("2026-10-15");
    await studyPlanService.saveWeek(student, { weekMinutes: week(120) }, NOW);

    const papers = (await items()).filter((i) => i.kind === "paper");
    expect(papers.map((i) => [i.day, i.paper?.title, i.minutes])).toEqual([
      [MONDAY, "June 2022", 60],
      ["2026-10-13", "June 2023", 90],
    ]);
    expect(papers[0].paper?.id).toBe(fresh.id);
  });

  it("gives assignments time in the days before they're due", async () => {
    await deadline("2026-10-14", { kind: "assignment", title: "Lab report" });
    await studyPlanService.makePlan(student, NOW);
    const work = (await items()).filter((i) => i.kind === "assignment");
    expect(work.map((i) => i.day)).toEqual([MONDAY, "2026-10-13"]);
  });
});

describe("working through it", () => {
  it("ticks items off, skips them and moves them, and replanning keeps what is done", async () => {
    await deadline("2026-10-30");
    await studyPlanService.saveWeek(student, { weekMinutes: week(60) }, NOW);
    const [first, second] = (await items()).filter((i) => i.day === MONDAY);

    await studyPlanService.setItemStatus(student, { id: first!.id, status: "done" }, NOW);
    await studyPlanService.setItemStatus(student, { id: second!.id, status: "skipped" }, NOW);
    let today = await studyPlanService.getToday(student, NOW);
    expect(today?.items.map((i) => i.status)).toEqual(["done", "skipped"]);
    const { days } = await studyPlanService.getWeek(student, NOW);
    expect(days[0]).toMatchObject({ minutes: 30, doneMinutes: 30 });

    await studyPlanService.setItemStatus(student, { id: second!.id, status: "todo" }, NOW);
    await studyPlanService.moveItem(student, { id: second!.id, day: "2026-10-14" }, NOW);
    const wednesday = (await items()).filter((i) => i.day === "2026-10-14");
    expect(wednesday[wednesday.length - 1]?.id).toBe(second!.id);

    // Replanning keeps the finished block and fills the rest of Monday around it.
    await studyPlanService.makePlan(student, NOW);
    today = await studyPlanService.getToday(student, NOW);
    expect(today?.items[0]).toMatchObject({ id: first!.id, status: "done" });
    expect(today?.items.reduce((t, i) => t + i.minutes, 0)).toBe(60);
    expect((await items()).some((i) => i.id === second!.id)).toBe(false);
  });

  it("refuses moves outside the coming week", async () => {
    await deadline("2026-10-30");
    await studyPlanService.makePlan(student, NOW);
    const [first] = await items();
    expect(await code(() => studyPlanService.moveItem(student, { id: first!.id, day: "2026-10-11" }, NOW))).toBe(
      "VALIDATION",
    );
    expect(await code(() => studyPlanService.moveItem(student, { id: first!.id, day: "2026-10-19" }, NOW))).toBe(
      "VALIDATION",
    );
  });

  it("says when the plan was made on an earlier day and when it has run out", async () => {
    await deadline("2026-11-30");
    await studyPlanService.makePlan(student, NOW);
    expect(await studyPlanService.getToday(student, NOW)).toMatchObject({ outdated: false, ended: false });

    const wednesday = await studyPlanService.getWeek(student, later(2));
    expect(wednesday.missed).toBe(4);
    expect(wednesday.days.map((d) => d.planned)).toEqual([true, true, true, true, true, false, false]);
    expect(await studyPlanService.getToday(student, later(2))).toMatchObject({ outdated: true, ended: false });
    expect(await studyPlanService.getToday(student, later(7))).toMatchObject({ outdated: true, ended: true });

    await studyPlanService.makePlan(student, later(2));
    const replanned = await studyPlanService.getWeek(student, later(2));
    expect(replanned.days.every((d) => d.planned)).toBe(true);
  });

  it("drops an exam's items when the exam is deleted", async () => {
    const { id } = await deadline("2026-10-30");
    await studyPlanService.makePlan(student, NOW);
    expect((await items()).length).toBeGreaterThan(0);
    await plannerService.deleteDeadline(student, { id });
    expect(await items()).toEqual([]);
  });

  it("doesn't let viewers change anything, or anyone reach another workspace's items", async () => {
    await deadline("2026-10-30");
    await studyPlanService.makePlan(student, NOW);
    const [first] = await items();
    const viewer = { ...student, role: "viewer" as const };
    expect(await code(() => studyPlanService.makePlan(viewer, NOW))).toBe("FORBIDDEN");
    expect(await code(() => studyPlanService.saveWeek(viewer, { weekMinutes: week(30) }, NOW))).toBe("FORBIDDEN");
    expect(await code(() => studyPlanService.setItemStatus(viewer, { id: first!.id, status: "done" }, NOW))).toBe(
      "FORBIDDEN",
    );

    const bob = await createTestUser("Bob");
    expect(await code(() => studyPlanService.setItemStatus(bob, { id: first!.id, status: "done" }, NOW))).toBe(
      "NOT_FOUND",
    );
    expect(await code(() => studyPlanService.moveItem(bob, { id: first!.id, day: MONDAY }, NOW))).toBe("NOT_FOUND");
    expect(await items(bob)).toEqual([]);
    expect((await items()).find((i) => i.id === first!.id)?.status).toBe("todo");
  });
});
