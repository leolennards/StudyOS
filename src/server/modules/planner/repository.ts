import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import { deadlines, deadlineTopics, subjects, topicConfidence, topics } from "@/server/platform/db/schema";

/**
 * All SQL for the planner module (Architecture §28). Every query is scoped
 * by workspace id, and the composite foreign keys stop a deadline from
 * pointing at another workspace's subject or topics.
 */
export type DeadlineInsert = typeof deadlines.$inferInsert;

const deadlineColumns = {
  id: deadlines.id,
  subjectId: deadlines.subjectId,
  kind: deadlines.kind,
  title: deadlines.title,
  dueOn: deadlines.dueOn,
  startsAt: deadlines.startsAt,
  location: deadlines.location,
  subjectName: subjects.name,
  subjectColour: subjects.colour,
  subjectArchived: sql<boolean>`${subjects.archivedAt} is not null`,
};

export const plannerRepository = {
  // ── deadlines ─────────────────────────────────────────────────────────────
  async insertDeadline(db: DbExecutor, row: DeadlineInsert) {
    await db.insert(deadlines).values(row);
  },

  async updateDeadline(db: DbExecutor, ws: string, id: string, patch: Partial<DeadlineInsert>) {
    const rows = await db
      .update(deadlines)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(deadlines.workspaceId, ws), eq(deadlines.id, id)))
      .returning({ id: deadlines.id });
    return rows.length > 0;
  },

  async deleteDeadline(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .delete(deadlines)
      .where(and(eq(deadlines.workspaceId, ws), eq(deadlines.id, id)))
      .returning({ id: deadlines.id });
    return rows.length > 0;
  },

  async findDeadline(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .select(deadlineColumns)
      .from(deadlines)
      .leftJoin(subjects, and(eq(subjects.id, deadlines.subjectId), eq(subjects.workspaceId, ws)))
      .where(and(eq(deadlines.workspaceId, ws), eq(deadlines.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Every deadline, soonest first. */
  listDeadlines(db: DbExecutor, ws: string) {
    return db
      .select(deadlineColumns)
      .from(deadlines)
      .leftJoin(subjects, and(eq(subjects.id, deadlines.subjectId), eq(subjects.workspaceId, ws)))
      .where(eq(deadlines.workspaceId, ws))
      .orderBy(asc(deadlines.dueOn), asc(deadlines.startsAt), asc(deadlines.title));
  },

  // ── topics an exam covers ─────────────────────────────────────────────────
  /** The topics picked for a deadline. None means it covers its whole subject. */
  async listPickedTopics(db: DbExecutor, ws: string, deadlineId: string) {
    const rows = await db
      .select({ topicId: deadlineTopics.topicId })
      .from(deadlineTopics)
      .where(and(eq(deadlineTopics.workspaceId, ws), eq(deadlineTopics.deadlineId, deadlineId)));
    return rows.map((r) => r.topicId);
  },

  async replacePickedTopics(db: DbExecutor, ws: string, deadlineId: string, topicIds: string[]) {
    await db
      .delete(deadlineTopics)
      .where(and(eq(deadlineTopics.workspaceId, ws), eq(deadlineTopics.deadlineId, deadlineId)));
    if (topicIds.length > 0) {
      await db.insert(deadlineTopics).values(topicIds.map((topicId) => ({ workspaceId: ws, deadlineId, topicId })));
    }
  },

  /**
   * The topics each deadline covers, in subject order, with the student's
   * confidence in each (null if not rated): the picked topics, or every
   * topic in the subject when none were picked.
   */
  async coveredTopics(db: DbExecutor, ws: string, deadlineIds: string[]) {
    if (deadlineIds.length === 0) return [];
    const ids = sql.join(
      deadlineIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const result = await db.execute(sql`
      select d.id as deadline_id, t.id as topic_id, t.name as topic_name, c.level
      from ${deadlines} d
      join ${topics} t on t.workspace_id = d.workspace_id and (
        exists (select 1 from ${deadlineTopics} p where p.deadline_id = d.id and p.topic_id = t.id)
        or (
          t.subject_id = d.subject_id
          and not exists (select 1 from ${deadlineTopics} p where p.deadline_id = d.id)
        )
      )
      left join ${topicConfidence} c on c.workspace_id = d.workspace_id and c.topic_id = t.id
      where d.workspace_id = ${ws} and d.id in (${ids})
      order by d.id, t.position, t.name
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({
      deadlineId: String(r.deadline_id),
      topicId: String(r.topic_id),
      topicName: String(r.topic_name),
      level: r.level == null ? null : Number(r.level),
    }));
  },

  // ── confidence ────────────────────────────────────────────────────────────
  async confidenceFor(db: DbExecutor, ws: string, topicIds: string[]) {
    if (topicIds.length === 0) return [];
    return db
      .select({ topicId: topicConfidence.topicId, level: topicConfidence.level })
      .from(topicConfidence)
      .where(and(eq(topicConfidence.workspaceId, ws), inArray(topicConfidence.topicId, topicIds)));
  },

  async setConfidence(db: DbExecutor, ws: string, topicId: string, level: number) {
    await db
      .insert(topicConfidence)
      .values({ workspaceId: ws, topicId, level })
      .onConflictDoUpdate({
        target: [topicConfidence.workspaceId, topicConfidence.topicId],
        set: { level, updatedAt: new Date() },
      });
  },

  async clearConfidence(db: DbExecutor, ws: string, topicId: string) {
    await db
      .delete(topicConfidence)
      .where(and(eq(topicConfidence.workspaceId, ws), eq(topicConfidence.topicId, topicId)));
  },
};
