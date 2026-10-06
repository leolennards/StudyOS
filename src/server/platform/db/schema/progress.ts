import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { subjects } from "./knowledge";
import { workspaces } from "./workspaces";

/**
 * Study sessions from the focus timer (Architecture §28, §29). With the flashcard
 * ratings in `card_reviews` they make up the study time behind the daily
 * goal, streaks and the progress page. `focused_seconds` leaves out time the
 * timer was paused, so it can be shorter than `ended_at - started_at`.
 */
export const studySessions = pgTable(
  "study_sessions",
  {
    /** Chosen by the browser, so a retried save is recorded once. */
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** The subject the session was for, if one was chosen. Kept as general study if the subject is deleted. */
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    focusedSeconds: integer("focused_seconds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("study_sessions_workspace_idx").on(t.workspaceId, t.startedAt),
    check("study_sessions_order", sql`${t.endedAt} >= ${t.startedAt}`),
    check("study_sessions_seconds_range", sql`${t.focusedSeconds} > 0 and ${t.focusedSeconds} <= 86400`),
  ],
);
