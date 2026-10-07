"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { plannerService } from "@/server/modules/planner/service";
import {
  createDeadlineSchema,
  deleteDeadlineSchema,
  setDeadlineTopicsSchema,
  setTopicConfidenceSchema,
  updateDeadlineSchema,
} from "@/server/modules/planner/schemas";

/** Thin transport layer for the planner module: validation, auth and error mapping live in `action()`. */

const refresh = (id?: string) => {
  revalidatePath("/exams");
  revalidatePath("/today");
  if (id) revalidatePath(`/exams/${id}`);
};

export const createDeadline = action(createDeadlineSchema, async (ctx, input) => {
  const result = await plannerService.createDeadline(ctx, input);
  refresh();
  return result;
});

export const updateDeadline = action(updateDeadlineSchema, async (ctx, input) => {
  const result = await plannerService.updateDeadline(ctx, input);
  refresh(input.id);
  return result;
});

export const deleteDeadline = action(deleteDeadlineSchema, async (ctx, input) => {
  const result = await plannerService.deleteDeadline(ctx, input);
  refresh();
  return result;
});

export const setDeadlineTopics = action(setDeadlineTopicsSchema, async (ctx, input) => {
  const result = await plannerService.setDeadlineTopics(ctx, input);
  refresh(input.id);
  return result;
});

export const setTopicConfidence = action(setTopicConfidenceSchema, async (ctx, input) => {
  const result = await plannerService.setTopicConfidence(ctx, input);
  // Confidence is shared by every exam that covers the topic.
  revalidatePath("/exams", "layout");
  revalidatePath("/today");
  return result;
});
