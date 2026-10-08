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
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { subjects, topics } from "./knowledge";
import { documents } from "./library";
import { workspaces } from "./workspaces";

/**
 * Past papers (Architecture §22, `past_papers`). A paper belongs to a
 * subject and goes with it. The paper's file and its mark scheme are
 * optional links to documents in the library; deleting the document only
 * clears the link.
 */
export const pastPapers = pgTable(
  "past_papers",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").notNull(),
    title: text("title").notNull(),
    year: smallint("year"),
    /** How long the paper allows, in minutes. */
    durationMin: smallint("duration_min"),
    /** The paper's total, used when its questions haven't been entered. */
    totalMarks: smallint("total_marks"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    markSchemeId: uuid("mark_scheme_id").references(() => documents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "past_papers_subject_fk",
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }).onDelete("cascade"),
    unique("past_papers_workspace_id_id_key").on(t.workspaceId, t.id),
    check("past_papers_total_marks", sql`${t.totalMarks} is null or ${t.totalMarks} > 0`),
    index("past_papers_subject_idx").on(t.workspaceId, t.subjectId),
  ],
);

/** The questions on a paper, in order, with the marks each is worth (`past_paper_questions`). */
export const pastPaperQuestions = pgTable(
  "past_paper_questions",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    paperId: uuid("paper_id").notNull(),
    /** As printed on the paper: "1", "2b", "3a(ii)". */
    number: text("number").notNull(),
    marks: smallint("marks").notNull(),
    position: smallint("position").notNull(),
  },
  (t) => [
    foreignKey({
      name: "past_paper_questions_paper_fk",
      columns: [t.workspaceId, t.paperId],
      foreignColumns: [pastPapers.workspaceId, pastPapers.id],
    }).onDelete("cascade"),
    unique("past_paper_questions_workspace_id_id_key").on(t.workspaceId, t.id),
    check("past_paper_questions_marks", sql`${t.marks} > 0`),
    index("past_paper_questions_paper_idx").on(t.workspaceId, t.paperId, t.position),
  ],
);

/** The topics each question tests. A question can test several. */
export const pastPaperQuestionTopics = pgTable(
  "past_paper_question_topics",
  {
    workspaceId: uuid("workspace_id").notNull(),
    questionId: uuid("question_id").notNull(),
    topicId: uuid("topic_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.topicId] }),
    foreignKey({
      name: "past_paper_question_topics_question_fk",
      columns: [t.workspaceId, t.questionId],
      foreignColumns: [pastPaperQuestions.workspaceId, pastPaperQuestions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "past_paper_question_topics_topic_fk",
      columns: [t.workspaceId, t.topicId],
      foreignColumns: [topics.workspaceId, topics.id],
    }).onDelete("cascade"),
    index("past_paper_question_topics_topic_idx").on(t.workspaceId, t.topicId),
  ],
);

/**
 * A sitting of a past paper and the student's mark. The score and what it
 * was out of are kept as they were on the day, so editing the paper's
 * questions later doesn't rewrite old results.
 */
export const pastPaperAttempts = pgTable(
  "past_paper_attempts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    paperId: uuid("paper_id").notNull(),
    /** The local calendar day the paper was sat. */
    takenOn: date("taken_on", { mode: "string" }).notNull(),
    /** Minutes taken, if the student timed it. */
    minutes: smallint("minutes"),
    score: smallint("score").notNull(),
    outOf: smallint("out_of").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "past_paper_attempts_paper_fk",
      columns: [t.workspaceId, t.paperId],
      foreignColumns: [pastPapers.workspaceId, pastPapers.id],
    }).onDelete("cascade"),
    unique("past_paper_attempts_workspace_id_id_key").on(t.workspaceId, t.id),
    check("past_paper_attempts_score", sql`${t.outOf} > 0 and ${t.score} between 0 and ${t.outOf}`),
    index("past_paper_attempts_paper_idx").on(t.workspaceId, t.paperId, t.takenOn),
  ],
);

/** The marks a student got on each question in an attempt. */
export const pastPaperAttemptMarks = pgTable(
  "past_paper_attempt_marks",
  {
    workspaceId: uuid("workspace_id").notNull(),
    attemptId: uuid("attempt_id").notNull(),
    questionId: uuid("question_id").notNull(),
    awarded: smallint("awarded").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.questionId] }),
    foreignKey({
      name: "past_paper_attempt_marks_attempt_fk",
      columns: [t.workspaceId, t.attemptId],
      foreignColumns: [pastPaperAttempts.workspaceId, pastPaperAttempts.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "past_paper_attempt_marks_question_fk",
      columns: [t.workspaceId, t.questionId],
      foreignColumns: [pastPaperQuestions.workspaceId, pastPaperQuestions.id],
    }).onDelete("cascade"),
    check("past_paper_attempt_marks_awarded", sql`${t.awarded} >= 0`),
    index("past_paper_attempt_marks_question_idx").on(t.workspaceId, t.questionId),
  ],
);
