/** Limits for flashcards, shared by the card editor (client) and the service (server). */
export const CARD_TEXT_MAX = 5_000;
/** Cloze deletions are numbered c1 to c20. */
export const CLOZE_MAX_NUMBER = 20;
/** The most cards a subject's list shows at once. */
export const CARD_LIST_MAX = 500;
/** How many items one review session loads; the summary offers to carry on when more are due. */
export const REVIEW_BATCH = 100;

/** Defaults and bounds for the review settings (Architecture §21). */
export const DEFAULT_RETENTION = 0.9;
export const RETENTION_MIN = 0.7;
export const RETENTION_MAX = 0.97;
export const DEFAULT_NEW_PER_DAY = 20;
export const NEW_PER_DAY_MAX = 500;
export const DEFAULT_REVIEWS_PER_DAY = 200;
export const REVIEWS_PER_DAY_MAX = 9_999;

/**
 * Learning cards due within this many minutes are shown in the current
 * session rather than left for later (Anki's "learn ahead" limit).
 */
export const LEARN_AHEAD_MINUTES = 20;
