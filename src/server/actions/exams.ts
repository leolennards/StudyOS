"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { examsService } from "@/server/modules/exams/service";
import {
  attemptIdSchema,
  createPaperSchema,
  logAttemptSchema,
  paperIdSchema,
  setQuestionsSchema,
  updatePaperSchema,
} from "@/server/modules/exams/schemas";

/** Thin transport layer for past papers: validation, auth and error mapping live in `action()`. */

const refresh = (subjectId: string, paperId?: string) => {
  // The subject's header counts papers, and exam pages show past-paper scores per topic.
  revalidatePath(`/subjects/${subjectId}`, "layout");
  if (paperId) revalidatePath(`/subjects/${subjectId}/papers/${paperId}`);
  revalidatePath("/exams", "layout");
};

export const createPaper = action(createPaperSchema, async (ctx, input) => {
  const result = await examsService.createPaper(ctx, input);
  refresh(result.subjectId);
  return { id: result.id };
});

export const updatePaper = action(updatePaperSchema, async (ctx, input) => {
  const result = await examsService.updatePaper(ctx, input);
  refresh(result.subjectId, result.id);
  return { id: result.id };
});

export const deletePaper = action(paperIdSchema, async (ctx, input) => {
  const result = await examsService.deletePaper(ctx, input);
  refresh(result.subjectId);
  return { id: result.id };
});

export const setPaperQuestions = action(setQuestionsSchema, async (ctx, input) => {
  const result = await examsService.setQuestions(ctx, input);
  refresh(result.subjectId, result.id);
  return { questionCount: result.questionCount, total: result.total };
});

export const logPaperAttempt = action(logAttemptSchema, async (ctx, input) => {
  const result = await examsService.logAttempt(ctx, input);
  refresh(result.subjectId, result.paperId);
  return { id: result.id, score: result.score, outOf: result.outOf };
});

export const deletePaperAttempt = action(attemptIdSchema, async (ctx, input) => {
  const result = await examsService.deleteAttempt(ctx, input);
  refresh(result.subjectId, result.paperId);
  return { id: result.id };
});
