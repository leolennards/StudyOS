/** Limits for notes, shared by the editor (client) and the service (server). */
export const NOTE_TITLE_MAX = 200;
/** The editor document, serialised as JSON. About 150 pages of dense text. */
export const NOTE_CONTENT_MAX_CHARS = 1_000_000;
/** How deeply blocks may nest (lists inside lists inside quotes, and so on). */
export const NOTE_MAX_DEPTH = 24;
/** Trashed notes are deleted for good after this many days. */
export const TRASH_RETENTION_DAYS = 30;
