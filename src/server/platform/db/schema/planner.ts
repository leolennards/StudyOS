import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { pastPapers } from "./exams";
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

/**
 * A workspace's weekly study plan (Architecture §28, `study_plans`): the
 * minutes the student has free on each day of the week, Monday first, and
 * the day the current plan starts. One row per workspace.
 */
export const studyPlans = pgTable(
  "study_plans",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    weekMinutes: integer("week_minutes").array().notNull(),
    /** The first day of the current plan, or null before one is made. */
    startsOn: date("starts_on", { mode: "string" }),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("study_plans_week_minutes", sql`cardinality(${t.weekMinutes}) = 7`),
    check("study_plans_week_minutes_range", sql`0 <= all(${t.weekMinutes}) and 720 >= all(${t.weekMinutes})`),
  ],
);

/**
 * One block of a study plan (`plan_items`): flashcards, a topic for an exam,
 * a past paper or an assignment, on a day, with how long it should take.
 * An item goes when the exam, topic or paper it is for is deleted.
 */
export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    position: smallint("position").notNull(),
    kind: text("kind", { enum: ["review", "topic", "paper", "assignment"] }).notNull(),
    minutes: smallint("minutes").notNull(),
    deadlineId: uuid("deadline_id"),
    topicId: uuid("topic_id"),
    paperId: uuid("paper_id"),
    /** Flashcards expected, for a review block. */
    cards: integer("cards"),
    status: text("status", { enum: ["todo", "done", "skipped"] })
      .notNull()
      .default("todo"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "plan_items_deadline_fk",
      columns: [t.workspaceId, t.deadlineId],
      foreignColumns: [deadlines.workspaceId, deadlines.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "plan_items_topic_fk",
      columns: [t.workspaceId, t.topicId],
      foreignColumns: [topics.workspaceId, topics.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "plan_items_paper_fk",
      columns: [t.workspaceId, t.paperId],
      foreignColumns: [pastPapers.workspaceId, pastPapers.id],
    }).onDelete("cascade"),
    check("plan_items_kind", sql`${t.kind} in ('review', 'topic', 'paper', 'assignment')`),
    check("plan_items_status", sql`${t.status} in ('todo', 'done', 'skipped')`),
    check("plan_items_minutes", sql`${t.minutes} between 1 and 720`),
    index("plan_items_workspace_day_idx").on(t.workspaceId, t.day, t.position),
  ],
);
