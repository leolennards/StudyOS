import { z } from "zod";
import { CARD_TEXT_MAX } from "./domain/limits";

/** Input schemas shared by the card editor and review screen (client) and the actions (server). */
const id = z.uuid("That item isn't valid");

const cardText = z
  .string()
  .max(CARD_TEXT_MAX, `Keep each side under ${CARD_TEXT_MAX.toLocaleString("en-GB")} characters`);

export const CARD_TYPES = ["basic", "reverse", "cloze"] as const;

const cardFields = {
  type: z.enum(CARD_TYPES),
  front: cardText,
  back: cardText,
  topicIds: z.array(id).max(200, "That's too many topics for one card").optional(),
};

export const createCardSchema = z.object({
  subjectId: id,
  ...cardFields,
  /** Where the card was made from: a note, or a page of a document. */
  sourceNoteId: id.nullish(),
  sourceDocumentId: id.nullish(),
  sourcePage: z.number().int().positive().nullish(),
});

export const updateCardSchema = z.object({ id, ...cardFields });

export const cardIdSchema = z.object({ id });

export const setCardSuspendedSchema = z.object({ id, suspended: z.boolean() });

/** Which cards a review session covers: everything, a subject, or one topic. */
export const reviewScopeSchema = z.object({
  subjectId: id.optional(),
  topicId: id.optional(),
});

/** One rating. `reviewId` is chosen by the browser so a retried request is recorded once. */
export const reviewCardSchema = z.object({
  reviewId: id,
  cardId: id,
  ordinal: z.number().int().min(0).max(99),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  durationMs: z
    .number()
    .int()
    .min(0)
    .transform((ms) => Math.min(ms, 60 * 60 * 1000))
    .optional(),
});

export const undoReviewSchema = z.object({ reviewId: id });

export type CreateCardInput = z.input<typeof createCardSchema>;
export type UpdateCardInput = z.input<typeof updateCardSchema>;
export type ReviewScope = z.output<typeof reviewScopeSchema>;
