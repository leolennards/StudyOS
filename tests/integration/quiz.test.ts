import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { seededRandom } from "@/server/modules/assessment/domain/quiz";
import { assessmentService } from "@/server/modules/assessment/service";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { plannerService } from "@/server/modules/planner/service";
import { progressService } from "@/server/modules/progress/service";
import { closeDb } from "@/server/platform/db/client";
import { createTestUser, resetDatabase } from "../helpers/db";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;
let cells: string;
let genetics: string;

const NOW = new Date("2026-10-07T15:00:00Z");

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

async function card(front: string, back: string, topicIds: string[] = [], sId = subjectId, ctx = student) {
  const { id } = await flashcardsService.createCard(ctx, { subjectId: sId, type: "basic", front, back, topicIds });
  return id;
}

const start = (input: Partial<Parameters<typeof assessmentService.startQuiz>[1]> = {}, ctx = student, seed = 1) =>
  assessmentService.startQuiz(ctx, { count: 10, format: "choice", ...input }, NOW, seededRandom(seed));

beforeEach(async () => {
  await resetDatabase();
  student = await createTestUser();
  subjectId = await subject();
  cells = await topic("Cells");
  genetics = await topic("Genetics");
  await card("Powerhouse of the cell", "Mitochondria", [cells]);
  await card("Controls what enters the cell", "Cell membrane", [cells]);
  await card("Makes proteins", "Ribosome", [cells]);
  await card("Unit of heredity", "Gene", [genetics]);
  await card("Shape of DNA", "Double helix", [genetics]);
  await card("Father of genetics", "Gregor Mendel");
});

afterAll(async () => {
  await closeDb();
});

describe("starting a quiz", () => {
  it("asks each card in the subject once, with the right answer among the options", async () => {
    const { id, questions } = await start({ subjectId });
    expect(questions).toBe(6);
    const quiz = await assessmentService.getAttempt(student, id);
    expect(quiz).toMatchObject({ label: "Biology", finished: false, format: "choice" });
    expect(new Set(quiz.questions.map((q) => q.cardId)).size).toBe(6);
    for (const q of quiz.questions) {
      expect(q.kind).toBe("choice");
      expect(q.options).toContain(q.expected);
      expect(q.options!.length).toBe(4);
      expect(q.answer).toBeNull();
    }
  });

  it("narrows to a topic, or to the topics an exam covers", async () => {
    const topicQuiz = await assessmentService.getAttempt(student, (await start({ topicId: genetics })).id);
    expect(topicQuiz.label).toBe("Biology · Genetics");
    expect(topicQuiz.questions.map((q) => q.expected).sort()).toEqual(["Double helix", "Gene"]);
    // Wrong options still come from the whole subject.
    expect(
      topicQuiz.questions
        .flatMap((q) => q.options)
        .some((o) => o === "Mitochondria" || o === "Ribosome" || o === "Cell membrane" || o === "Gregor Mendel"),
    ).toBe(true);

    const { id: examId } = await plannerService.createDeadline(
      student,
      { kind: "exam", title: "Cells test", subjectId, dueOn: "2026-10-20", startsAt: null, location: null },
      NOW,
    );
    // Covering the whole subject includes cards with no topic.
    const whole = await assessmentService.getAttempt(student, (await start({ deadlineId: examId })).id);
    expect(whole.label).toBe("Cells test");
    expect(whole.questions).toHaveLength(6);

    await plannerService.setDeadlineTopics(student, { id: examId, topicIds: [cells] });
    const picked = await assessmentService.getAttempt(student, (await start({ deadlineId: examId })).id);
    expect(picked.questions.map((q) => q.expected).sort()).toEqual(["Cell membrane", "Mitochondria", "Ribosome"]);
  });

  it("refuses when there's nothing to ask, or an exam has no subject", async () => {
    const empty = await subject(student, "Chemistry");
    expect(await code(() => start({ subjectId: empty }))).toBe("VALIDATION");
    const { id } = await plannerService.createDeadline(
      student,
      { kind: "exam", title: "General", subjectId: null, dueOn: "2026-10-20", startsAt: null, location: null },
      NOW,
    );
    expect(await code(() => start({ deadlineId: id }))).toBe("VALIDATION");
  });

  it("never changes when cards are due for review", async () => {
    const before = await flashcardsService.getOverview(student, { subjectId }, NOW);
    const { id } = await start({ subjectId });
    const quiz = await assessmentService.getAttempt(student, id);
    await assessmentService.answerQuestion(
      student,
      {
        attemptId: id,
        position: 0,
        answer: { kind: "choice", option: quiz.questions[0].options!.indexOf(quiz.questions[0].expected) },
      },
      NOW,
    );
    const after = await flashcardsService.getOverview(student, { subjectId }, NOW);
    expect(after).toEqual(before);
  });
});

describe("answering", () => {
  it("marks answers once, takes an override, and scores by topic", async () => {
    const { id } = await start({ subjectId, format: "typed" });
    const quiz = await assessmentService.getAttempt(student, id);
    const byAnswer = new Map(quiz.questions.map((q) => [q.expected, q]));
    const answer = (expected: string, text: string) =>
      assessmentService.answerQuestion(
        student,
        {
          attemptId: id,
          position: byAnswer.get(expected)!.position,
          answer: { kind: "typed", text },
          durationMs: 20_000,
        },
        NOW,
      );

    expect(await answer("Mitochondria", "mitochondira")).toEqual({
      correct: true,
      close: true,
      expected: "Mitochondria",
    });
    expect(await answer("Ribosome", "nucleus")).toMatchObject({ correct: false });
    // A second answer to the same question keeps the first mark.
    expect(await answer("Ribosome", "ribosome")).toMatchObject({ correct: false });
    expect(await answer("Gene", "allele")).toMatchObject({ correct: false });
    await assessmentService.overrideAnswer(student, { attemptId: id, position: byAnswer.get("Gene")!.position });
    // A choice answer to a typed question doesn't fit.
    expect(
      await code(() =>
        assessmentService.answerQuestion(
          student,
          { attemptId: id, position: byAnswer.get("Double helix")!.position, answer: { kind: "choice", option: 0 } },
          NOW,
        ),
      ),
    ).toBe("VALIDATION");

    await assessmentService.finishQuiz(student, { id }, NOW);
    const done = await assessmentService.getAttempt(student, id);
    expect(done.finished).toBe(true);
    expect(done.score).toEqual({ answered: 3, correct: 2, percent: 67 });
    expect(done.topics).toEqual([
      { topicId: cells, name: "Cells", answered: 2, correct: 1, percent: 50 },
      { topicId: genetics, name: "Genetics", answered: 1, correct: 1, percent: 100 },
    ]);
    expect(done.questions.find((q) => q.expected === "Gene")!.answer).toMatchObject({
      correct: true,
      overridden: true,
    });

    const [recent] = await assessmentService.listRecent(student);
    expect(recent).toMatchObject({
      id,
      label: "Biology",
      questions: 6,
      answered: 3,
      correct: 2,
      percent: 67,
      finished: true,
    });
  });

  it("retries only the questions missed", async () => {
    const { id } = await start({ subjectId, format: "typed" });
    const quiz = await assessmentService.getAttempt(student, id);
    for (const q of quiz.questions) {
      const text = q.expected === "Gene" || q.expected === "Ribosome" ? "no idea" : q.expected;
      await assessmentService.answerQuestion(
        student,
        { attemptId: id, position: q.position, answer: { kind: "typed", text } },
        NOW,
      );
    }
    expect((await assessmentService.getAttempt(student, id)).finished).toBe(true);

    const retry = await start({ retryOf: id, format: "typed" });
    expect(retry.questions).toBe(2);
    const again = await assessmentService.getAttempt(student, retry.id);
    expect(again.questions.map((q) => q.expected).sort()).toEqual(["Gene", "Ribosome"]);
    expect(again.label).toBe("Biology");
  });

  it("counts towards study time and shows on the exam's topics", async () => {
    const { id: examId } = await plannerService.createDeadline(
      student,
      { kind: "exam", title: "Final", subjectId, dueOn: "2026-10-20", startsAt: null, location: null },
      NOW,
    );
    const { id } = await start({ deadlineId: examId, format: "typed" });
    const quiz = await assessmentService.getAttempt(student, id);
    for (const q of quiz.questions) {
      const text = q.expected === "Gene" ? "no idea" : q.expected;
      await assessmentService.answerQuestion(
        student,
        { attemptId: id, position: q.position, answer: { kind: "typed", text }, durationMs: 30_000 },
        new Date(NOW.getTime() - 60_000),
      );
    }

    const habits = await progressService.getHabits(student, NOW);
    expect(habits.todaySeconds).toBe(6 * 30);
    expect(habits.studiedToday).toBe(true);

    const exam = await plannerService.getDeadline(student, examId, NOW);
    const g = exam.topics.find((t) => t.topicId === genetics)!;
    expect(g.quiz).toEqual({ answered: 2, correct: 1 });
    expect(g.quizScore).toBe(0.5);
    // Genetics went worse than Cells, so it comes first among unrated topics.
    expect(exam.workOn.map((t) => t.name)).toEqual(["Genetics", "Cells"]);
  });
});

describe("access", () => {
  it("viewers can look but not take quizzes", async () => {
    const { id } = await start({ subjectId });
    const viewer = { ...student, role: "viewer" as const };
    expect(await code(() => start({ subjectId }, viewer))).toBe("FORBIDDEN");
    expect(
      await code(() =>
        assessmentService.answerQuestion(
          viewer,
          { attemptId: id, position: 0, answer: { kind: "choice", option: 0 } },
          NOW,
        ),
      ),
    ).toBe("FORBIDDEN");
    expect(await code(() => assessmentService.getAttempt(viewer, id))).toBe("OK");
  });

  it("keeps each workspace's quizzes to itself", async () => {
    const { id } = await start({ subjectId });
    const bob = await createTestUser("Bob");
    expect(await code(() => assessmentService.getAttempt(bob, id))).toBe("NOT_FOUND");
    expect(
      await code(() =>
        assessmentService.answerQuestion(
          bob,
          { attemptId: id, position: 0, answer: { kind: "choice", option: 0 } },
          NOW,
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(await code(() => assessmentService.finishQuiz(bob, { id }))).toBe("NOT_FOUND");
    expect(await code(() => start({ subjectId }, bob))).toBe("NOT_FOUND");
    expect(await code(() => start({ topicId: cells }, bob))).toBe("NOT_FOUND");
    expect(await code(() => start({ retryOf: id }, bob))).toBe("NOT_FOUND");
    expect(await assessmentService.listRecent(bob)).toEqual([]);
    // Bob's quiz on everything draws on his cards only.
    expect(await code(() => start({}, bob))).toBe("VALIDATION");
  });
});
