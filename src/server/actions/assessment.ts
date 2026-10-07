"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { assessmentService } from "@/server/modules/assessment/service";
import {
  answerQuestionSchema,
  attemptIdSchema,
  overrideAnswerSchema,
  startQuizSchema,
} from "@/server/modules/assessment/schemas";

/** Thin transport layer for the assessment module: validation, auth and error mapping live in `action()`. */

export const startQuiz = action(startQuizSchema, async (ctx, input) => {
  const result = await assessmentService.startQuiz(ctx, input);
  revalidatePath("/quiz");
  return result;
});

/**
 * One answer during a quiz. Like a review rating it revalidates nothing:
 * the quiz screen keeps its own state, and re-rendering it mid-quiz would
 * lose the feedback on screen. The results revalidate when the quiz ends.
 */
export const answerQuestion = action(answerQuestionSchema, (ctx, input) =>
  assessmentService.answerQuestion(ctx, input),
);

export const overrideAnswer = action(overrideAnswerSchema, (ctx, input) =>
  assessmentService.overrideAnswer(ctx, input),
);

export const finishQuiz = action(attemptIdSchema, async (ctx, input) => {
  const result = await assessmentService.finishQuiz(ctx, input);
  revalidatePath("/quiz");
  revalidatePath(`/quiz/${input.id}`);
  // Quiz results change what Today, Exams and Progress show.
  revalidatePath("/today");
  revalidatePath("/exams", "layout");
  revalidatePath("/progress");
  return result;
});
