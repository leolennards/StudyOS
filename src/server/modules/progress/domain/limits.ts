/** Limits for study time, goals and the focus timer, shared by the browser and the server. */

/** Daily study goal, in minutes (Settings). */
export const DEFAULT_DAILY_GOAL_MINUTES = 30;
export const DAILY_GOAL_MIN = 5;
export const DAILY_GOAL_MAX = 720;

/**
 * Time on one flashcard counts as study time up to this cap, so a card left
 * on screen while the student walks away doesn't inflate the day.
 */
export const REVIEW_SECONDS_CAP = 120;

/** Focus sessions shorter than this are not saved. */
export const FOCUS_MIN_SECONDS = 60;
/** The longest single focus session the timer offers or the server accepts. */
export const FOCUS_MAX_MINUTES = 180;
/** Focus lengths the timer offers, in minutes, and the break that follows each. */
export const FOCUS_PRESETS = [
  { focus: 15, rest: 3 },
  { focus: 25, rest: 5 },
  { focus: 45, rest: 10 },
  { focus: 60, rest: 10 },
] as const;
export const DEFAULT_FOCUS_MINUTES = 25;

/** How far back the progress page's heatmap reaches, in weeks. */
export const HEATMAP_WEEKS = 26;
/** The window for recall, weak topics and time per subject, in days. */
export const INSIGHT_WINDOW_DAYS = 30;
/** A topic needs at least this many ratings in the window before it is called weak. */
export const WEAK_TOPIC_MIN_RATINGS = 5;
/** How many days ahead the review forecast looks, today included. */
export const FORECAST_DAYS = 7;
