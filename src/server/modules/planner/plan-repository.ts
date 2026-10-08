import { and, asc, eq, gte, lt, lte, ne, sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import {
  cardTopics,
  deadlines,
  pastPapers,
  planItems,
  studyPlans,
  subjects,
  topics,
} from "@/server/platform/db/schema";

/**
 * All SQL for study plans (Architecture §28). Every query is scoped by
 * workspace id, and the composite foreign keys stop a plan item from
 * pointing at another workspace's exam, topic or paper.
 */
export type PlanItemInsert = typeof planItems.$inferInsert;

const itemById = (ws: string, id: string) => and(eq(planItems.workspaceId, ws), eq(planItems.id, id));

export const planRepository = {
  // ── the plan ──────────────────────────────────────────────────────────────
  async findPlan(db: DbExecutor, ws: string) {
    const rows = await db.select().from(studyPlans).where(eq(studyPlans.workspaceId, ws)).limit(1);
    return rows[0] ?? null;
  },

  async saveWeek(db: DbExecutor, ws: string, weekMinutes: number[]) {
    await db
      .insert(studyPlans)
      .values({ workspaceId: ws, weekMinutes })
      .onConflictDoUpdate({ target: studyPlans.workspaceId, set: { weekMinutes, updatedAt: new Date() } });
  },

  async markPlanned(db: DbExecutor, ws: string, startsOn: string, at: Date) {
    await db.update(studyPlans).set({ startsOn, plannedAt: at, updatedAt: at }).where(eq(studyPlans.workspaceId, ws));
  },

  // ── items ─────────────────────────────────────────────────────────────────
  /** The items from one day to another, both included, in order, with what each is for. */
  listItems(db: DbExecutor, ws: string, from: string, to: string) {
    return db
      .select({
        id: planItems.id,
        day: planItems.day,
        position: planItems.position,
        kind: planItems.kind,
        minutes: planItems.minutes,
        cards: planItems.cards,
        status: planItems.status,
        deadlineId: planItems.deadlineId,
        deadlineTitle: deadlines.title,
        deadlineKind: deadlines.kind,
        deadlineDueOn: deadlines.dueOn,
        topicId: planItems.topicId,
        topicName: topics.name,
        /** Flashcards on the topic, so the plan can send the student to them. */
        topicCards: sql<number>`(select count(*) from ${cardTopics} where ${cardTopics.workspaceId} = ${ws} and ${cardTopics.topicId} = ${planItems.topicId})`,
        paperId: planItems.paperId,
        paperTitle: pastPapers.title,
        subjectId: subjects.id,
        subjectName: subjects.name,
        subjectColour: subjects.colour,
      })
      .from(planItems)
      .leftJoin(deadlines, and(eq(deadlines.workspaceId, ws), eq(deadlines.id, planItems.deadlineId)))
      .leftJoin(topics, and(eq(topics.workspaceId, ws), eq(topics.id, planItems.topicId)))
      .leftJoin(pastPapers, and(eq(pastPapers.workspaceId, ws), eq(pastPapers.id, planItems.paperId)))
      .leftJoin(
        subjects,
        and(
          eq(subjects.workspaceId, ws),
          eq(subjects.id, sql`coalesce(${pastPapers.subjectId}, ${topics.subjectId}, ${deadlines.subjectId})`),
        ),
      )
      .where(and(eq(planItems.workspaceId, ws), gte(planItems.day, from), lte(planItems.day, to)))
      .orderBy(asc(planItems.day), asc(planItems.position));
  },

  /** Finished items from a day on: they stay when the plan is made again. */
  listDone(db: DbExecutor, ws: string, from: string) {
    return db
      .select({
        day: planItems.day,
        minutes: planItems.minutes,
        position: planItems.position,
        kind: planItems.kind,
        deadlineId: planItems.deadlineId,
        topicId: planItems.topicId,
      })
      .from(planItems)
      .where(and(eq(planItems.workspaceId, ws), gte(planItems.day, from), eq(planItems.status, "done")));
  },

  /**
   * Clears the way for a new plan from a day on: removes the items not
   * finished from that day, and every item older than `before`.
   */
  async clearFrom(db: DbExecutor, ws: string, from: string, before: string) {
    await db
      .delete(planItems)
      .where(
        and(
          eq(planItems.workspaceId, ws),
          sql`((${planItems.day} >= ${from} and ${planItems.status} <> 'done') or ${planItems.day} < ${before})`,
        ),
      );
  },

  async insertItems(db: DbExecutor, rows: PlanItemInsert[]) {
    if (rows.length > 0) await db.insert(planItems).values(rows);
  },

  async findItem(db: DbExecutor, ws: string, id: string) {
    const rows = await db.select().from(planItems).where(itemById(ws, id)).limit(1);
    return rows[0] ?? null;
  },

  async updateItem(db: DbExecutor, ws: string, id: string, patch: Partial<PlanItemInsert>) {
    const rows = await db
      .update(planItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(itemById(ws, id))
      .returning({ id: planItems.id });
    return rows.length > 0;
  },

  /** The position after the last item on a day, other than this one. */
  async nextPosition(db: DbExecutor, ws: string, day: string, exceptId: string) {
    const rows = await db
      .select({ max: sql<number | null>`max(${planItems.position})` })
      .from(planItems)
      .where(and(eq(planItems.workspaceId, ws), eq(planItems.day, day), ne(planItems.id, exceptId)));
    const max = rows[0]?.max;
    return max === null || max === undefined ? 0 : Number(max) + 1;
  },

  /** Items still to do on days before this one, which the student never got to. */
  async countMissed(db: DbExecutor, ws: string, before: string, since: string) {
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(planItems)
      .where(
        and(
          eq(planItems.workspaceId, ws),
          lt(planItems.day, before),
          gte(planItems.day, since),
          eq(planItems.status, "todo"),
        ),
      );
    return Number(rows[0]?.n ?? 0);
  },
};
