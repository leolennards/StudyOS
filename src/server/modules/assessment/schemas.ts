import { z } from "zod";
import { QUIZ_FORMATS, QUIZ_LIMITS } from "./domain/quiz";

/** Input schemas shared by the quiz screens (client) and the actions (server). */

const id = z.uuid("That item isn't valid");

/** What to build a quiz from: a subject, one of its topics, an exam, or the questions missed in an earlier quiz. */
export const startQuizSchema = z.object({
  subjectId: id.optional(),
  topicId: id.optional(),
  deadlineId: id.optional(),
  retryOf: id.optional(),
  count: z.number().int().min(1).max(QUIZ_LIMITS.questions),
  format: z.enum(QUIZ_FORMATS),
});

export const answerQuestionSchema = z.object({
  attemptId: id,
  position: z.number().int().min(0).max(99),
  answer: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("choice"),
      option: z
        .number()
        .int()
        .min(0)
        .max(QUIZ_LIMITS.options - 1),
    }),
    z.object({ kind: z.literal("typed"), text: z.string().max(QUIZ_LIMITS.answerLength, "That answer is too long") }),
    z.object({ kind: z.literal("self"), correct: z.boolean() }),
  ]),
  durationMs: z
    .number()
    .int()
    .min(0)
    .transform((ms) => Math.min(ms, 60 * 60 * 1000))
    .optional(),
});

/** "I was right": counts a typed answer marked wrong as right. */
export const overrideAnswerSchema = z.object({ attemptId: id, position: z.number().int().min(0).max(99) });

export const attemptIdSchema = z.object({ id });

export type StartQuizInput = z.input<typeof startQuizSchema>;
