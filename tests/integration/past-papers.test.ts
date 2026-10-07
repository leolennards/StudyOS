import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { closeDb } from "@/server/platform/db/client";
import { stopBoss } from "@/server/platform/jobs";
import { examsService } from "@/server/modules/exams/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { libraryService } from "@/server/modules/library/service";
import { plannerService } from "@/server/modules/planner/service";
import { createTestUser, resetDatabase } from "../helpers/db";
import { uploadFile } from "../helpers/documents";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;
let thermo: string;
let waves: string;

const NOW = new Date("2026-10-07T15:00:00Z");

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "OK";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

async function subject(ctx = student, name = "Physics") {
  const { id } = await knowledgeService.createSubject(ctx, {
    name,
    code: null,
    term: null,
    description: null,
    colour: "sky",
  });
  return id;
}

async function topic(name: string, subject = subjectId, ctx = student) {
  const { id } = await knowledgeService.createTopic(ctx, {
    subjectId: subject,
    sectionId: null,
    name,
    description: null,
  });
  return id;
}

async function paper(title: string, extra: { year?: number; totalMarks?: number } = {}) {
  const { id } = await examsService.createPaper(student, { subjectId, title, ...extra });
  return id;
}

/** Saves questions and returns their ids in order. */
async function questions(paperId: string, list: { number: string; marks: number; topicIds?: string[] }[]) {
  await examsService.setQuestions(student, {
    paperId,
    questions: list.map((q) => ({ ...q, topicIds: q.topicIds ?? [] })),
  });
  return (await examsService.getPaper(student, paperId, NOW)).questions.map((q) => q.id);
}

function sit(paperId: string, takenOn: string, marks: [string, number][]) {
  return examsService.logAttempt(
    student,
    { paperId, takenOn, marks: marks.map(([questionId, awarded]) => ({ questionId, awarded })) },
    NOW,
  );
}

beforeEach(async () => {
  await resetDatabase();
  student = await createTestUser();
  subjectId = await subject();
  thermo = await topic("Thermodynamics");
  waves = await topic("Waves");
});

afterAll(async () => {
  await stopBoss();
  await closeDb();
});

describe("papers and questions", () => {
  it("lists a subject's papers newest first with their totals", async () => {
    await paper("Paper 1", { year: 2022, totalMarks: 80 });
    const june = await paper("June 2023 Paper 1", { year: 2023 });
    await questions(june, [
      { number: "1", marks: 6, topicIds: [thermo] },
      { number: "2", marks: 4, topicIds: [thermo, waves] },
    ]);

    const { papers } = await examsService.getSubjectPapers(student, subjectId);
    expect(papers.map((p) => [p.title, p.total, p.questionCount])).toEqual([
      ["June 2023 Paper 1", 10, 2],
      ["Paper 1", 80, 0],
    ]);
  });

  it("keeps a question's logged marks when it is renumbered or moved, and drops them when it is deleted", async () => {
    const id = await paper("Paper 1");
    const [one, two] = await questions(id, [
      { number: "1", marks: 6 },
      { number: "2", marks: 4 },
    ]);
    const attempt = await sit(id, "2026-10-01", [
      [one, 5],
      [two, 1],
    ]);
    expect(attempt).toMatchObject({ score: 6, outOf: 10 });

    await examsService.setQuestions(student, {
      paperId: id,
      questions: [
        { id: two, number: "1", marks: 4, topicIds: [waves] },
        { number: "2", marks: 3, topicIds: [] },
      ],
    });
    const saved = await examsService.getPaper(student, id, NOW);
    expect(saved.questions.map((q) => [q.number, q.marks, q.topicIds])).toEqual([
      ["1", 4, [waves]],
      ["2", 3, []],
    ]);
    expect(saved.questions[0].id).toBe(two);
    expect(saved.marks[attempt.id]).toEqual({ [two]: 1 });
    // The attempt keeps the score it had on the day.
    expect(saved.attempts.map((a) => [a.score, a.outOf])).toEqual([[6, 10]]);
  });

  it("refuses topics from another subject and question ids from another paper", async () => {
    const id = await paper("Paper 1");
    const other = await paper("Paper 2");
    const [elsewhere] = await questions(other, [{ number: "1", marks: 2 }]);
    const chemistry = await subject(student, "Chemistry");
    const bonding = await topic("Bonding", chemistry);

    expect(
      await code(() =>
        examsService.setQuestions(student, {
          paperId: id,
          questions: [{ number: "1", marks: 2, topicIds: [bonding] }],
        }),
      ),
    ).toBe("VALIDATION");
    expect(
      await code(() =>
        examsService.setQuestions(student, {
          paperId: id,
          questions: [{ id: elsewhere, number: "1", marks: 2, topicIds: [] }],
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("links the paper and its mark scheme only to documents in the same subject", async () => {
    const doc = await uploadFile(student, subjectId, "Paper 1.txt", Buffer.from("Question 1"), { process: false });
    const chemistry = await subject(student, "Chemistry");
    const elsewhere = await uploadFile(student, chemistry, "Other.txt", Buffer.from("Other"), { process: false });

    const id = (await examsService.createPaper(student, { subjectId, title: "Paper 1", documentId: doc })).id;
    expect((await examsService.getPaper(student, id, NOW)).document).toEqual({ id: doc, title: "Paper 1" });
    expect(
      await code(() =>
        examsService.updatePaper(student, { id, title: "Paper 1", documentId: doc, markSchemeId: elsewhere }),
      ),
    ).toBe("VALIDATION");

    // Deleting the document keeps the paper and clears the link.
    await libraryService.deleteDocument(student, { id: doc });
    expect((await examsService.getPaper(student, id, NOW)).document).toBeNull();
  });
});

describe("attempts", () => {
  it("logs a score for a paper without its questions, out of the paper's total unless told otherwise", async () => {
    const id = await paper("Paper 1", { totalMarks: 80 });
    expect(
      await examsService.logAttempt(student, { paperId: id, takenOn: "2026-09-01", marks: [], score: 52 }, NOW),
    ).toMatchObject({
      score: 52,
      outOf: 80,
    });
    expect(
      await code(() =>
        examsService.logAttempt(student, { paperId: id, takenOn: "2026-09-01", marks: [], score: 81 }, NOW),
      ),
    ).toBe("VALIDATION");
    const untotalled = await paper("Paper 2");
    expect(
      await code(() =>
        examsService.logAttempt(student, { paperId: untotalled, takenOn: "2026-09-01", marks: [], score: 10 }, NOW),
      ),
    ).toBe("VALIDATION");
    expect(
      await examsService.logAttempt(
        student,
        { paperId: untotalled, takenOn: "2026-09-01", marks: [], score: 10, outOf: 40 },
        NOW,
      ),
    ).toMatchObject({ score: 10, outOf: 40 });
  });

  it("needs a mark for every question, within its marks, on a sensible date", async () => {
    const id = await paper("Paper 1");
    const [one, two] = await questions(id, [
      { number: "1", marks: 6 },
      { number: "2", marks: 4 },
    ]);
    expect(await code(() => sit(id, "2026-10-01", [[one, 5]]))).toBe("CONFLICT");
    expect(
      await code(() =>
        sit(id, "2026-10-01", [
          [one, 7],
          [two, 1],
        ]),
      ),
    ).toBe("VALIDATION");
    const marks: [string, number][] = [
      [one, 6],
      [two, 4],
    ];
    expect(await code(() => sit(id, "2026-10-08", marks))).toBe("VALIDATION");
    expect(await code(() => sit(id, "2020-01-01", marks))).toBe("VALIDATION");
    expect(await code(() => sit(id, "2026-10-07", marks))).toBe("OK");
  });

  it("tracks the latest and best score and which way it's going", async () => {
    const id = await paper("Paper 1");
    const [one] = await questions(id, [{ number: "1", marks: 10 }]);
    await sit(id, "2026-09-01", [[one, 4]]);
    await sit(id, "2026-09-20", [[one, 8]]);
    const last = await sit(id, "2026-10-05", [[one, 7]]);

    const { papers } = await examsService.getSubjectPapers(student, subjectId);
    expect(papers[0]).toMatchObject({
      latest: { takenOn: "2026-10-05", score: 7 },
      best: { takenOn: "2026-09-20", score: 8 },
      trend: "down",
    });

    await examsService.deleteAttempt(student, { id: last.id });
    const after = await examsService.getSubjectPapers(student, subjectId);
    expect(after.papers[0]).toMatchObject({ latest: { score: 8 }, trend: "up" });
  });
});

describe("topic analysis", () => {
  it("weighs topics by their marks and scores them from the latest attempt at each paper", async () => {
    const p1 = await paper("Paper 1", { year: 2023 });
    const [a, b] = await questions(p1, [
      { number: "1", marks: 6, topicIds: [thermo] },
      { number: "2", marks: 4, topicIds: [thermo, waves] },
    ]);
    const p2 = await paper("Paper 2", { year: 2024 });
    const [c, d] = await questions(p2, [
      { number: "1", marks: 8, topicIds: [waves] },
      { number: "2", marks: 2 },
    ]);
    await sit(p1, "2026-09-01", [
      [a, 0],
      [b, 0],
    ]);
    // Only the latest attempt at a paper counts.
    await sit(p1, "2026-09-10", [
      [a, 3],
      [b, 4],
    ]);
    await sit(p2, "2026-09-12", [
      [c, 2],
      [d, 2],
    ]);

    const { analysis, focus } = await examsService.getSubjectPapers(student, subjectId);
    expect(analysis).toMatchObject({ paperCount: 2, totalMarks: 20, untaggedShare: 0.1 });
    expect(analysis.topics.map((t) => [t.name, t.share, t.papers, t.score])).toEqual([
      ["Waves", 0.5, 2, 4 / 10],
      ["Thermodynamics", 0.4, 1, 5 / 8],
    ]);
    expect(focus.map((t) => t.name)).toEqual(["Waves", "Thermodynamics"]);

    const scores = await examsService.getTopicScores(student, subjectId);
    expect(scores.get(waves)).toEqual({ score: 0.4, share: 0.5, papers: 2 });
  });

  it("feeds past-paper scores into what an exam says to work on first", async () => {
    const { id: examId } = await plannerService.createDeadline(
      student,
      { kind: "exam", title: "Physics final", subjectId, dueOn: "2026-11-20" },
      NOW,
    );
    const p1 = await paper("Paper 1");
    const [a, b] = await questions(p1, [
      { number: "1", marks: 10, topicIds: [thermo] },
      { number: "2", marks: 10, topicIds: [waves] },
    ]);
    await sit(p1, "2026-10-01", [
      [a, 9],
      [b, 2],
    ]);

    const exam = await plannerService.getDeadline(student, examId, NOW);
    expect(exam.topics.map((t) => [t.name, t.paperScore])).toEqual([
      ["Thermodynamics", 0.9],
      ["Waves", 0.2],
    ]);
    // Neither topic is rated, so the weaker past-paper score goes first.
    expect(exam.workOn.map((t) => t.name)).toEqual(["Waves", "Thermodynamics"]);
  });
});

describe("access", () => {
  it("viewers can read past papers but not change them", async () => {
    const id = await paper("Paper 1", { totalMarks: 50 });
    const viewer = { ...student, role: "viewer" as const };
    expect(await code(() => examsService.getSubjectPapers(viewer, subjectId))).toBe("OK");
    expect(await code(() => examsService.createPaper(viewer, { subjectId, title: "Paper 2" }))).toBe("FORBIDDEN");
    expect(await code(() => examsService.setQuestions(viewer, { paperId: id, questions: [] }))).toBe("FORBIDDEN");
    expect(
      await code(() =>
        examsService.logAttempt(viewer, { paperId: id, takenOn: "2026-10-01", marks: [], score: 1 }, NOW),
      ),
    ).toBe("FORBIDDEN");
    expect(await code(() => examsService.deletePaper(viewer, { id }))).toBe("FORBIDDEN");
  });

  it("deleting a subject deletes its papers", async () => {
    const id = await paper("Paper 1");
    await knowledgeService.deleteSubject(student, { id: subjectId, confirmName: "Physics" });
    expect(await code(() => examsService.getPaper(student, id, NOW))).toBe("NOT_FOUND");
  });
});
