import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { cards } from "./flashcards";
import { subjects, topics } from "./knowledge";
import { deadlines } from "./planner";
import { workspaces } from "./workspaces";

/**
 * Practice quizzes made from flashcards (Architecture §19, ADR-017). An
 * attempt is one quiz: what it was drawn from and when it was taken. Its
 * questions are rows of `quiz_questions`; scores are counted from them when
 * read, never stored, so they stay right if a card is later deleted.
 */
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** The subject the quiz was drawn from, or null for every subject. */
    subjectId: uuid("subject_id"),
    /** The topic or exam it was narrowed to, if any. Kept as a subject quiz if that is deleted. */
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    deadlineId: uuid("deadline_id").references(() => deadlines.id, { onDelete: "set null" }),
    format: text("format", { enum: ["choice", "typed", "mixed"] }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "quiz_attempts_subject_fk",
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }).onDelete("cascade"),
    unique("quiz_attempts_workspace_id_id_key").on(t.workspaceId, t.id),
    check("quiz_attempts_format", sql`${t.format} in ('choice', 'typed', 'mixed')`),
    index("quiz_attempts_workspace_idx").on(t.workspaceId, t.startedAt),
  ],
);

/**
 * One question of a quiz: which card item it asks, how, and what the
 * student answered. The expected answer and the options are kept as they
 * were asked, so editing a card later doesn't change a past mark.
 */
export const quizQuestions = pgTable(
  "quiz_questions",
  {
    workspaceId: uuid("workspace_id").notNull(),
    attemptId: uuid("attempt_id").notNull(),
    position: smallint("position").notNull(),
    cardId: uuid("card_id").notNull(),
    ordinal: smallint("ordinal").notNull(),
    kind: text("kind", { enum: ["choice", "typed", "self"] }).notNull(),
    expected: text("expected").notNull(),
    options: jsonb("options").$type<string[] | null>(),
    /** What the student chose or typed. Empty for a self-marked question. */
    given: text("given"),
    correct: boolean("correct"),
    /** The answer was within a typing slip of the expected one. */
    close: boolean("close").notNull().default(false),
    /** `user` when the student overrode the mark ("I was right"). */
    markedBy: text("marked_by", { enum: ["auto", "user"] }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.position] }),
    foreignKey({
      name: "quiz_questions_attempt_fk",
      columns: [t.workspaceId, t.attemptId],
      foreignColumns: [quizAttempts.workspaceId, quizAttempts.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "quiz_questions_card_fk",
      columns: [t.workspaceId, t.cardId],
      foreignColumns: [cards.workspaceId, cards.id],
    }).onDelete("cascade"),
    index("quiz_questions_card_idx").on(t.workspaceId, t.cardId),
    index("quiz_questions_answered_idx").on(t.workspaceId, t.answeredAt),
    check("quiz_questions_kind", sql`${t.kind} in ('choice', 'typed', 'self')`),
    check("quiz_questions_answered", sql`(${t.answeredAt} is null) = (${t.correct} is null)`),
    check("quiz_questions_position_range", sql`${t.position} >= 0 and ${t.position} < 100`),
  ],
);
