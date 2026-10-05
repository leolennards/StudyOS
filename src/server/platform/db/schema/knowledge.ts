import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspaces } from "./workspaces";

/**
 * Knowledge structure (ADR-006): Subject → Sections (tree, max 2 levels) → Topics.
 * Composite foreign keys on (workspace_id, …) make it impossible at the
 * database level for a section or topic to point at another workspace's subject.
 */
export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    colour: text("colour").notNull(),
    term: text("term"),
    description: text("description"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("subjects_workspace_id_id_key").on(t.workspaceId, t.id),
    index("subjects_workspace_idx").on(t.workspaceId, t.archivedAt, t.name),
  ],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => sections.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "sections_subject_fk",
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }).onDelete("cascade"),
    check("sections_not_own_parent", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    index("sections_subject_idx").on(t.workspaceId, t.subjectId, t.parentId, t.position),
  ],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "topics_subject_fk",
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }).onDelete("cascade"),
    index("topics_subject_idx").on(t.workspaceId, t.subjectId, t.sectionId, t.position),
  ],
);
