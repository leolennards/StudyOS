import { z } from "zod";
import { calendarDate } from "@/server/modules/planner/schemas";
import { PAPER_LIMITS } from "./domain/papers";

/** Input schemas shared by the past-paper forms (client) and the actions (server). */

const id = z.uuid("That item isn't valid");

/** A whole number typed into a form: empty means none. */
const optionalWhole = (min: number, max: number, message: string) =>
  z
    .union([z.number(), z.string().trim()])
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int(message).min(min, message).max(max, message).nullable())
    .nullable()
    .optional();

const paperFields = {
  title: z
    .string()
    .trim()
    .min(1, "Give the paper a name")
    .max(PAPER_LIMITS.title, `Keep it under ${PAPER_LIMITS.title} characters`),
  year: optionalWhole(PAPER_LIMITS.yearFrom, PAPER_LIMITS.yearTo, "Use a year like 2023"),
  durationMin: optionalWhole(1, PAPER_LIMITS.minutes, `Use a number of minutes up to ${PAPER_LIMITS.minutes}`),
  totalMarks: optionalWhole(1, PAPER_LIMITS.totalMarks, `Use a number of marks up to ${PAPER_LIMITS.totalMarks}`),
  documentId: id.nullable().optional(),
  markSchemeId: id.nullable().optional(),
};

export const createPaperSchema = z.object({ subjectId: id, ...paperFields });
export const updatePaperSchema = z.object({ id, ...paperFields });
export const paperIdSchema = z.object({ id });

const question = z.object({
  /** An existing question keeps its id, so marks already logged against it stay. */
  id: id.optional(),
  number: z
    .string()
    .trim()
    .min(1, "Number every question")
    .max(PAPER_LIMITS.questionNumber, `Keep question numbers under ${PAPER_LIMITS.questionNumber} characters`),
  marks: z
    .number("Give every question its marks")
    .int("Marks are whole numbers")
    .min(1, "Every question is worth at least 1 mark")
    .max(PAPER_LIMITS.questionMarks, `A question can be worth up to ${PAPER_LIMITS.questionMarks} marks`),
  topicIds: z.array(id).max(PAPER_LIMITS.topicsPerQuestion),
});

/** A paper's questions in order. Questions left out are deleted, with the marks logged against them. */
export const setQuestionsSchema = z.object({
  paperId: id,
  questions: z
    .array(question)
    .max(PAPER_LIMITS.questions, `A paper can have up to ${PAPER_LIMITS.questions} questions`),
});

const marks = z.number().int("Marks are whole numbers").min(0, "Marks can't be negative");

/**
 * One sitting of a paper. With its questions entered, a mark for each
 * question; without them, the score and what it was out of.
 */
export const logAttemptSchema = z.object({
  paperId: id,
  takenOn: calendarDate,
  minutes: optionalWhole(1, PAPER_LIMITS.minutes, `Use a number of minutes up to ${PAPER_LIMITS.minutes}`),
  marks: z.array(z.object({ questionId: id, awarded: marks })).max(PAPER_LIMITS.questions),
  score: marks.max(PAPER_LIMITS.totalMarks).optional(),
  outOf: z.number().int().min(1).max(PAPER_LIMITS.totalMarks).optional(),
});

export const attemptIdSchema = z.object({ id });

export type PaperFormInput = z.input<typeof createPaperSchema>;
