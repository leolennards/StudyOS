import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { subjects, topics } from "./knowledge";
import { workspaces } from "./workspaces";

/**
 * Exams, tests and assignment deadlines (Architecture §28, `deadlines`).
 * The date is a calendar date in the student's own time zone, so a
 * countdown never shifts by a day when the clocks change. A deadline with
 * a subject belongs to it and goes when the subject is deleted.
 */
export const deadlines = pgTable(
  "deadlines",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id"),
    kind: text("kind", { enum: ["exam", "test", "assignment"] }).notNull(),
    title: text("title").notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    /** Local start (or hand-in) time, if known. */
    startsAt: time("starts_at"),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "deadlines_subject_fk",
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }).onDelete("cascade"),
    unique("deadlines_workspace_id_id_key").on(t.workspaceId, t.id),
    check("deadlines_kind", sql`${t.kind} in ('exam', 'test', 'assignment')`),
    index("deadlines_workspace_idx").on(t.workspaceId, t.dueOn),
  ],
);

/**
 * The topics a deadline covers. None means every topic in its subject, so
 * topics added later are covered without the student having to remember.
 */
export const deadlineTopics = pgTable(
  "deadline_topics",
  {
    workspaceId: uuid("workspace_id").notNull(),
    deadlineId: uuid("deadline_id").notNull(),
    topicId: uuid("topic_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deadlineId, t.topicId] }),
    foreignKey({
      name: "deadline_topics_deadline_fk",
      columns: [t.workspaceId, t.deadlineId],
      foreignColumns: [deadlines.workspaceId, deadlines.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "deadline_topics_topic_fk",
      columns: [t.workspaceId, t.topicId],
      foreignColumns: [topics.workspaceId, topics.id],
    }).onDelete("cascade"),
    index("deadline_topics_topic_idx").on(t.workspaceId, t.topicId),
  ],
);

/**
 * How confident the student says they are in a topic: 1 not yet, 2 getting
 * there, 3 confident. One rating per topic, shared by every exam that covers it.
 */
export const topicConfidence = pgTable(
  "topic_confidence",
  {
    workspaceId: uuid("workspace_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    level: smallint("level").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.topicId] }),
    foreignKey({
      name: "topic_confidence_topic_fk",
      columns: [t.workspaceId, t.topicId],
      foreignColumns: [topics.workspaceId, topics.id],
    }).onDelete("cascade"),
    check("topic_confidence_level", sql`${t.level} between 1 and 3`),
  ],
);
