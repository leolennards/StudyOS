import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import { sections, subjects, topics } from "@/server/platform/db/schema";

/**
 * All SQL for the knowledge module. Every query is scoped by workspace id:
 * lookups by id are always `id = $1 and workspace_id = $2`.
 */

type SubjectRow = typeof subjects.$inferSelect;
type SectionRow = typeof sections.$inferSelect;
type TopicRow = typeof topics.$inferSelect;
export type { SubjectRow, SectionRow, TopicRow };

const parentFilter = (parentId: string | null) =>
  parentId ? eq(sections.parentId, parentId) : isNull(sections.parentId);
const sectionFilter = (sectionId: string | null) =>
  sectionId ? eq(topics.sectionId, sectionId) : isNull(topics.sectionId);

export const knowledgeRepository = {
  // ── subjects ──────────────────────────────────────────────────────────────
  async listSubjects(db: DbExecutor, ws: string, opts: { archived: boolean }) {
    const sectionCounts = db
      .select({ subjectId: sections.subjectId, n: count().as("section_count") })
      .from(sections)
      .where(eq(sections.workspaceId, ws))
      .groupBy(sections.subjectId)
      .as("sc");
    const topicCounts = db
      .select({ subjectId: topics.subjectId, n: count().as("topic_count") })
      .from(topics)
      .where(eq(topics.workspaceId, ws))
      .groupBy(topics.subjectId)
      .as("tc");
    return db
      .select({
        subject: subjects,
        sectionCount: sql<number>`coalesce(${sectionCounts.n}, 0)::int`,
        topicCount: sql<number>`coalesce(${topicCounts.n}, 0)::int`,
      })
      .from(subjects)
      .leftJoin(sectionCounts, eq(sectionCounts.subjectId, subjects.id))
      .leftJoin(topicCounts, eq(topicCounts.subjectId, subjects.id))
      .where(
        and(eq(subjects.workspaceId, ws), opts.archived ? isNotNull(subjects.archivedAt) : isNull(subjects.archivedAt)),
      )
      .orderBy(asc(sql`lower(${subjects.name})`));
  },

  async findSubject(db: DbExecutor, ws: string, id: string): Promise<SubjectRow | null> {
    const rows = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, id), eq(subjects.workspaceId, ws)))
      .limit(1);
    return rows[0] ?? null;
  },

  async insertSubject(db: DbExecutor, row: typeof subjects.$inferInsert) {
    await db.insert(subjects).values(row);
  },

  async updateSubject(db: DbExecutor, ws: string, id: string, patch: Partial<typeof subjects.$inferInsert>) {
    const rows = await db
      .update(subjects)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(subjects.id, id), eq(subjects.workspaceId, ws)))
      .returning({ id: subjects.id });
    return rows.length > 0;
  },

  async deleteSubject(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .delete(subjects)
      .where(and(eq(subjects.id, id), eq(subjects.workspaceId, ws)))
      .returning({ id: subjects.id });
    return rows.length > 0;
  },

  async countSubjects(db: DbExecutor, ws: string) {
    const [row] = await db
      .select({ n: count() })
      .from(subjects)
      .where(and(eq(subjects.workspaceId, ws), isNull(subjects.archivedAt)));
    return row?.n ?? 0;
  },

  // ── sections ──────────────────────────────────────────────────────────────
  async findSection(db: DbExecutor, ws: string, id: string): Promise<SectionRow | null> {
    const rows = await db
      .select()
      .from(sections)
      .where(and(eq(sections.id, id), eq(sections.workspaceId, ws)))
      .limit(1);
    return rows[0] ?? null;
  },

  listSectionsForSubject(db: DbExecutor, ws: string, subjectId: string) {
    return db
      .select()
      .from(sections)
      .where(and(eq(sections.workspaceId, ws), eq(sections.subjectId, subjectId)))
      .orderBy(asc(sections.position));
  },

  listSiblingSections(db: DbExecutor, ws: string, subjectId: string, parentId: string | null) {
    return db
      .select({ id: sections.id, position: sections.position })
      .from(sections)
      .where(and(eq(sections.workspaceId, ws), eq(sections.subjectId, subjectId), parentFilter(parentId)));
  },

  async insertSection(db: DbExecutor, row: typeof sections.$inferInsert) {
    await db.insert(sections).values(row);
  },

  async updateSection(db: DbExecutor, ws: string, id: string, patch: Partial<typeof sections.$inferInsert>) {
    const rows = await db
      .update(sections)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(sections.id, id), eq(sections.workspaceId, ws)))
      .returning({ id: sections.id });
    return rows.length > 0;
  },

  async deleteSection(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .delete(sections)
      .where(and(eq(sections.id, id), eq(sections.workspaceId, ws)))
      .returning({ id: sections.id });
    return rows.length > 0;
  },

  // ── topics ────────────────────────────────────────────────────────────────
  async findTopic(db: DbExecutor, ws: string, id: string): Promise<TopicRow | null> {
    const rows = await db
      .select()
      .from(topics)
      .where(and(eq(topics.id, id), eq(topics.workspaceId, ws)))
      .limit(1);
    return rows[0] ?? null;
  },

  listTopicsForSubject(db: DbExecutor, ws: string, subjectId: string) {
    return db
      .select()
      .from(topics)
      .where(and(eq(topics.workspaceId, ws), eq(topics.subjectId, subjectId)))
      .orderBy(asc(topics.position));
  },

  listSiblingTopics(db: DbExecutor, ws: string, subjectId: string, sectionId: string | null) {
    return db
      .select({ id: topics.id, position: topics.position })
      .from(topics)
      .where(and(eq(topics.workspaceId, ws), eq(topics.subjectId, subjectId), sectionFilter(sectionId)));
  },

  async insertTopic(db: DbExecutor, row: typeof topics.$inferInsert) {
    await db.insert(topics).values(row);
  },

  async updateTopic(db: DbExecutor, ws: string, id: string, patch: Partial<typeof topics.$inferInsert>) {
    const rows = await db
      .update(topics)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(topics.id, id), eq(topics.workspaceId, ws)))
      .returning({ id: topics.id });
    return rows.length > 0;
  },

  async deleteTopic(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .delete(topics)
      .where(and(eq(topics.id, id), eq(topics.workspaceId, ws)))
      .returning({ id: topics.id });
    return rows.length > 0;
  },

  async countTopicsInSections(db: DbExecutor, ws: string, sectionIds: string[]) {
    if (sectionIds.length === 0) return 0;
    const [row] = await db
      .select({ n: count() })
      .from(topics)
      .where(and(eq(topics.workspaceId, ws), sql`${topics.sectionId} in ${sectionIds}`));
    return row?.n ?? 0;
  },
};
