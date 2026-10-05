"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { flashcardsService } from "@/server/modules/flashcards/service";
import {
  cardIdSchema,
  createCardSchema,
  reviewCardSchema,
  reviewScopeSchema,
  setCardSuspendedSchema,
  undoReviewSchema,
  updateCardSchema,
} from "@/server/modules/flashcards/schemas";
import { toClientSession } from "@/server/modules/flashcards/types";

/** Thin transport layer for the flashcards module: validation, auth and error mapping live in `action()`. */

const refresh = (subjectId: string) => {
  revalidatePath("/today");
  revalidatePath("/review");
  revalidatePath(`/subjects/${subjectId}`, "layout");
};

export const createCard = action(createCardSchema, async (ctx, input) => {
  const result = await flashcardsService.createCard(ctx, input);
  refresh(result.subjectId);
  return result;
});

export const updateCard = action(updateCardSchema, async (ctx, input) => {
  const result = await flashcardsService.updateCard(ctx, input);
  refresh(result.subjectId);
  return result;
});

export const setCardSuspended = action(setCardSuspendedSchema, async (ctx, input) => {
  const result = await flashcardsService.setSuspended(ctx, input);
  refresh(result.subjectId);
  return result;
});

export const deleteCard = action(cardIdSchema, async (ctx, input) => {
  const result = await flashcardsService.deleteCard(ctx, input);
  refresh(result.subjectId);
  return result;
});

/**
 * One rating during a review session. Like autosave it revalidates nothing:
 * the session already moved on, and re-rendering the page under the student
 * would restart it. Counts elsewhere are fresh the next time they load.
 */
export const reviewCard = action(reviewCardSchema, async (ctx, input) => {
  const result = await flashcardsService.reviewCard(ctx, input);
  return { state: result.state, due: result.due.toISOString() };
});

export const undoReview = action(undoReviewSchema, (ctx, input) => flashcardsService.undoReview(ctx, input));

/** A fresh session for the same scope, when the student carries on after a summary. */
export const loadReviewSession = action(reviewScopeSchema, async (ctx, input) => {
  return toClientSession(await flashcardsService.getSession(ctx, input));
});
