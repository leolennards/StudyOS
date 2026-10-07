import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { plannerService } from "@/server/modules/planner/service";
import { settingsService } from "@/server/modules/settings/service";
import { closeDb } from "@/server/platform/db/client";
import { createTestUser, resetDatabase } from "../helpers/db";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;
let topicIds: string[];

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "OK";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

// 15:00 UTC on 7 October: already 8 October in Auckland.
const NOW = new Date("2026-10-07T15:00:00Z");

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

const exam = (dueOn: string, extra: Partial<Parameters<typeof plannerService.createDeadline>[1]> = {}, ctx = student) =>
  plannerService.createDeadline(
    ctx,
    { kind: "exam", title: "Biology final", subjectId, dueOn, startsAt: null, location: null, ...extra },
    NOW,
  );

beforeEach(async () => {
  await resetDatabase();
  student = await createTestUser();
  subjectId = await subject();
  topicIds = [await topic("Cells"), await topic("Genetics"), await topic("Ecology")];
});

afterAll(async () => {
  await closeDb();
});

describe("exams", () => {
  it("lists upcoming exams soonest first with a countdown, and past ones latest first", async () => {
    await exam("2026-11-20", { title: "Final" });
    await exam("2026-10-14", { title: "Midterm", kind: "test", startsAt: "09:30", location: "Hall B" });
    await exam("2026-10-07", { title: "Quiz today" });
    await exam("2026-09-01", { title: "Old" });
    await exam("2026-10-01", { title: "Less old" });

    const { today, upcoming, past } = await plannerService.listDeadlines(student, NOW);
    expect(today).toBe("2026-10-07");
    expect(upcoming.map((d) => [d.title, d.days])).toEqual([
      ["Quiz today", 0],
      ["Midterm", 7],
      ["Final", 44],
    ]);
    expect(upcoming[1]).toMatchObject({ kind: "test", startsAt: "09:30", location: "Hall B" });
    expect(upcoming[1].subject).toMatchObject({ id: subjectId, name: "Biology" });
    expect(past.map((d) => d.title)).toEqual(["Less old", "Old"]);
  });

  it("counts days in the student's own time zone", async () => {
    await exam("2026-10-14");
    await settingsService.update(student, { timezone: "Pacific/Auckland" });
    const { today, upcoming } = await plannerService.listDeadlines(student, NOW);
    expect(today).toBe("2026-10-08");
    expect(upcoming[0].days).toBe(6);
  });

  it("refuses dates far in the past or future, and a subject from nowhere", async () => {
    expect(await code(() => exam("2030-01-01"))).toBe("VALIDATION");
    expect(await code(() => exam("2025-01-01"))).toBe("VALIDATION");
    expect(await code(() => exam("2026-12-01", { subjectId: newId() }))).toBe("NOT_FOUND");
    expect(await code(() => exam("2026-12-01", { subjectId: null }))).toBe("OK");
  });

  it("edits and deletes an exam", async () => {
    const { id } = await exam("2026-11-20");
    await plannerService.updateDeadline(
      student,
      { id, kind: "assignment", title: "Essay", subjectId, dueOn: "2026-11-21", startsAt: "17:00", location: null },
      NOW,
    );
    const got = await plannerService.getDeadline(student, id, NOW);
    expect(got).toMatchObject({ kind: "assignment", title: "Essay", dueOn: "2026-11-21", startsAt: "17:00" });

    await plannerService.deleteDeadline(student, { id });
    expect(await code(() => plannerService.getDeadline(student, id, NOW))).toBe("NOT_FOUND");
  });

  it("goes when its subject is deleted", async () => {
    const { id } = await exam("2026-11-20");
    await knowledgeService.deleteSubject(student, { id: subjectId, confirmName: "Biology" });
    expect(await code(() => plannerService.getDeadline(student, id, NOW))).toBe("NOT_FOUND");
  });

  it("viewers can't change anything", async () => {
    const viewer = { ...student, role: "viewer" as const };
    expect(await code(() => exam("2026-11-20", {}, viewer))).toBe("FORBIDDEN");
    expect(await code(() => plannerService.setTopicConfidence(viewer, { topicId: topicIds[0], level: 3 }))).toBe(
      "FORBIDDEN",
    );
  });
});

describe("topics and readiness", () => {
  it("covers every topic in the subject until topics are picked, including ones added later", async () => {
    const { id } = await exam("2026-11-20");
    let got = await plannerService.getDeadline(student, id, NOW);
    expect(got.coversWholeSubject).toBe(true);
    expect(got.topics.map((t) => t.name)).toEqual(["Cells", "Genetics", "Ecology"]);

    await topic("Evolution");
    got = await plannerService.getDeadline(student, id, NOW);
    expect(got.topics).toHaveLength(4);

    await plannerService.setDeadlineTopics(student, { id, topicIds: [topicIds[2], topicIds[0]] });
    got = await plannerService.getDeadline(student, id, NOW);
    expect(got.coversWholeSubject).toBe(false);
    expect(got.topics.map((t) => t.name)).toEqual(["Cells", "Ecology"]);

    await plannerService.setDeadlineTopics(student, { id, topicIds: [] });
    got = await plannerService.getDeadline(student, id, NOW);
    expect(got.coversWholeSubject).toBe(true);
  });

  it("won't pick topics from another subject, or for an exam without one", async () => {
    const chemistry = await subject(student, "Chemistry");
    const bonds = await topic("Bonds", chemistry);
    const { id } = await exam("2026-11-20");
    expect(await code(() => plannerService.setDeadlineTopics(student, { id, topicIds: [bonds] }))).toBe("VALIDATION");
    const { id: general } = await exam("2026-11-20", { subjectId: null });
    expect(await code(() => plannerService.setDeadlineTopics(student, { id: general, topicIds: [topicIds[0]] }))).toBe(
      "VALIDATION",
    );
  });

  it("forgets picked topics when the exam moves to another subject", async () => {
    const chemistry = await subject(student, "Chemistry");
    await topic("Bonds", chemistry);
    const { id } = await exam("2026-11-20");
    await plannerService.setDeadlineTopics(student, { id, topicIds: [topicIds[0]] });
    await plannerService.updateDeadline(
      student,
      { id, kind: "exam", title: "Chem", subjectId: chemistry, dueOn: "2026-11-20", startsAt: null, location: null },
      NOW,
    );
    const got = await plannerService.getDeadline(student, id, NOW);
    expect(got.coversWholeSubject).toBe(true);
    expect(got.topics.map((t) => t.name)).toEqual(["Bonds"]);
  });

  it("works out readiness from confidence, shared by every exam with the topic", async () => {
    const { id: midterm } = await exam("2026-10-20");
    const { id: final } = await exam("2026-11-20");
    await plannerService.setTopicConfidence(student, { topicId: topicIds[0], level: 3 });
    await plannerService.setTopicConfidence(student, { topicId: topicIds[1], level: 2 });

    for (const id of [midterm, final]) {
      const got = await plannerService.getDeadline(student, id, NOW);
      expect(got.readiness).toMatchObject({ total: 3, confident: 1, gettingThere: 1, unrated: 1 });
      expect(got.readiness.score).toBeCloseTo(1.5 / 3);
    }
    const { upcoming } = await plannerService.listDeadlines(student, NOW);
    expect(upcoming[0].readiness.score).toBeCloseTo(0.5);

    await plannerService.setTopicConfidence(student, { topicId: topicIds[0], level: null });
    const got = await plannerService.getDeadline(student, midterm, NOW);
    expect(got.readiness).toMatchObject({ confident: 0, unrated: 2 });
  });

  it("suggests the least confident and most forgotten topics first", async () => {
    const { id } = await exam("2026-11-20");
    await plannerService.setTopicConfidence(student, { topicId: topicIds[0], level: 3 });
    await plannerService.setTopicConfidence(student, { topicId: topicIds[1], level: 2 });
    await plannerService.setTopicConfidence(student, { topicId: topicIds[2], level: 1 });

    // Cards on Genetics, mostly forgotten: recall is worked out once there are enough reviews.
    const { id: cardId } = await flashcardsService.createCard(student, {
      subjectId,
      type: "basic",
      front: "Q",
      back: "A",
      topicIds: [topicIds[1]],
    });
    const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
    await flashcardsService.reviewCard(
      student,
      { reviewId: newId(), cardId, ordinal: 0, rating: 3, durationMs: 5000 },
      at(48),
    );
    for (let i = 0; i < 5; i++) {
      await flashcardsService.reviewCard(
        student,
        { reviewId: newId(), cardId, ordinal: 0, rating: i < 4 ? 1 : 3, durationMs: 5000 },
        at(40 - i * 6),
      );
    }

    const got = await plannerService.getDeadline(student, id, NOW);
    expect(got.workOn.map((t) => t.name)).toEqual(["Ecology", "Genetics"]);
    const genetics = got.topics.find((t) => t.name === "Genetics")!;
    expect(genetics.cards).toBe(1);
    expect(genetics.recall).not.toBeNull();
    expect(genetics.recall!).toBeLessThan(0.5);

    const next = await plannerService.getNextDeadline(student, NOW);
    expect(next?.id).toBe(id);
    expect(next?.workOn.map((t) => t.name)).toEqual(["Ecology", "Genetics"]);
  });

  it("has no next exam once they have all passed", async () => {
    await exam("2026-10-01");
    expect(await plannerService.getNextDeadline(student, NOW)).toBeNull();
  });
});

describe("exams are scoped to the workspace", () => {
  it("another student can't see, change or use any of it", async () => {
    const { id } = await exam("2026-11-20");
    await plannerService.setTopicConfidence(student, { topicId: topicIds[0], level: 3 });
    const bob = await createTestUser("Bob");
    const bobSubject = await subject(bob, "Bob's subject");

    expect((await plannerService.listDeadlines(bob, NOW)).upcoming).toEqual([]);
    expect(await plannerService.getNextDeadline(bob, NOW)).toBeNull();
    expect(await code(() => plannerService.getDeadline(bob, id, NOW))).toBe("NOT_FOUND");
    expect(
      await code(() =>
        plannerService.updateDeadline(
          bob,
          { id, kind: "exam", title: "x", subjectId: bobSubject, dueOn: "2026-11-20", startsAt: null, location: null },
          NOW,
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(await code(() => plannerService.deleteDeadline(bob, { id }))).toBe("NOT_FOUND");
    expect(await code(() => plannerService.setDeadlineTopics(bob, { id, topicIds: [] }))).toBe("NOT_FOUND");
    expect(await code(() => plannerService.setTopicConfidence(bob, { topicId: topicIds[0], level: 1 }))).toBe(
      "NOT_FOUND",
    );
    // Bob can't point his own exam at Alice's subject or topics.
    expect(await code(() => exam("2026-11-20", { subjectId }, bob))).toBe("NOT_FOUND");
    const { id: bobExam } = await exam("2026-11-20", { subjectId: bobSubject }, bob);
    expect(await code(() => plannerService.setDeadlineTopics(bob, { id: bobExam, topicIds: [topicIds[0]] }))).toBe(
      "VALIDATION",
    );

    const mine = await plannerService.getDeadline(student, id, NOW);
    expect(mine.title).toBe("Biology final");
    expect(mine.readiness.confident).toBe(1);
  });
});
