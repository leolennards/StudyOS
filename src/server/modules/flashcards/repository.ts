import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import { cardReviews, cards, cardStates, cardTopics, subjects } from "@/server/platform/db/schema";
import { HEADLINE_OPTIONS } from "@/server/lib/search-query";
import type { MemoryState } from "./domain/scheduler";

/**
 * All SQL for the flashcards module. Every query is scoped by workspace id,
 * and the review queries only ever return cards that are not suspended.
 */
export type CardRow = typeof cards.$inferSelect;
export type CardInsert = typeof cards.$inferInsert;
export type StateRow = typeof cardStates.$inferSelect;

const byId = (ws: string, id: string) => and(eq(cards.id, id), eq(cards.workspaceId, ws));

/** Every column except the generated search vector, which the app never reads. */
const cardColumns = {
  id: cards.id,
  workspaceId: cards.workspaceId,
  subjectId: cards.subjectId,
  type: cards.type,
  front: cards.front,
  back: cards.back,
  origin: cards.origin,
  sourceNoteId: cards.sourceNoteId,
  sourceDocumentId: cards.sourceDocumentId,
  sourcePage: cards.sourcePage,
  suspendedAt: cards.suspendedAt,
  createdAt: cards.createdAt,
  updatedAt: cards.updatedAt,
};

/** Which cards a query covers: one subject, one topic, or every subject that isn't archived. */
export type Scope = { subjectId?: string; topicId?: string };

function scopeFilter(ws: string, scope: Scope): SQL | undefined {
  return and(
    scope.subjectId ? eq(cards.subjectId, scope.subjectId) : undefined,
    scope.topicId
      ? sql`exists (select 1 from ${cardTopics} where ${cardTopics.cardId} = ${cards.id} and ${cardTopics.workspaceId} = ${ws} and ${cardTopics.topicId} = ${scope.topicId})`
      : undefined,
    scope.subjectId || scope.topicId
      ? undefined
      : sql`exists (select 1 from ${subjects} where ${subjects.id} = ${cards.subjectId} and ${subjects.workspaceId} = ${ws} and ${subjects.archivedAt} is null)`,
  );
}

/** The columns a review item needs: the card's content and the item's memory state. */
const itemColumns = {
  cardId: cards.id,
  subjectId: cards.subjectId,
  type: cards.type,
  front: cards.front,
  back: cards.back,
  ordinal: cardStates.ordinal,
  due: cardStates.due,
  stability: cardStates.stability,
  difficulty: cardStates.difficulty,
  elapsedDays: cardStates.elapsedDays,
  scheduledDays: cardStates.scheduledDays,
  learningSteps: cardStates.learningSteps,
  reps: cardStates.reps,
  lapses: cardStates.lapses,
  state: cardStates.state,
  lastReview: cardStates.lastReview,
};

function itemsQuery(db: DbExecutor, ws: string, scope: Scope, where: SQL | undefined) {
  return db
    .select(itemColumns)
    .from(cardStates)
    .innerJoin(cards, and(eq(cards.id, cardStates.cardId), eq(cards.workspaceId, cardStates.workspaceId)))
    .where(and(eq(cardStates.workspaceId, ws), isNull(cards.suspendedAt), scopeFilter(ws, scope), where));
}

export const flashcardsRepository = {
  // ── cards ─────────────────────────────────────────────────────────────────
  async insertCard(db: DbExecutor, row: CardInsert) {
    await db.insert(cards).values(row);
  },

  async findCard(db: DbExecutor, ws: string, id: string) {
    const rows = await db.select(cardColumns).from(cards).where(byId(ws, id)).limit(1);
    return rows[0] ?? null;
  },

  /** A subject's cards, newest first, optionally only those linked to a topic. */
  listCards(db: DbExecutor, ws: string, scope: Scope & { subjectId: string }, limit: number) {
    return db
      .select(cardColumns)
      .from(cards)
      .where(and(eq(cards.workspaceId, ws), scopeFilter(ws, scope)))
      .orderBy(desc(cards.createdAt))
      .limit(limit);
  },

  async updateCard(
    db: DbExecutor,
    ws: string,
    id: string,
    patch: Partial<Pick<CardInsert, "type" | "front" | "back" | "suspendedAt">>,
  ) {
    const rows = await db
      .update(cards)
      .set({ ...patch, updatedAt: new Date() })
      .where(byId(ws, id))
      .returning({ id: cards.id });
    return rows.length > 0;
  },

  async deleteCard(db: DbExecutor, ws: string, id: string) {
    const rows = await db.delete(cards).where(byId(ws, id)).returning({ id: cards.id });
    return rows.length > 0;
  },

  async countCards(db: DbExecutor, ws: string, subjectId?: string) {
    const [row] = await db
      .select({ n: count() })
      .from(cards)
      .where(and(eq(cards.workspaceId, ws), subjectId ? eq(cards.subjectId, subjectId) : undefined));
    return row?.n ?? 0;
  },

  // ── topics ────────────────────────────────────────────────────────────────
  listTopicLinks(db: DbExecutor, ws: string, cardIds: string[]) {
    if (cardIds.length === 0) return Promise.resolve([]);
    return db
      .select({ cardId: cardTopics.cardId, topicId: cardTopics.topicId })
      .from(cardTopics)
      .where(and(eq(cardTopics.workspaceId, ws), inArray(cardTopics.cardId, cardIds)))
      .orderBy(asc(cardTopics.createdAt));
  },

  async replaceTopicLinks(db: DbExecutor, ws: string, cardId: string, topicIds: string[]) {
    await db.delete(cardTopics).where(and(eq(cardTopics.workspaceId, ws), eq(cardTopics.cardId, cardId)));
    if (topicIds.length > 0) {
      await db.insert(cardTopics).values(topicIds.map((topicId) => ({ workspaceId: ws, cardId, topicId })));
    }
  },

  // ── item states ───────────────────────────────────────────────────────────
  listStates(db: DbExecutor, ws: string, cardIds: string[]) {
    if (cardIds.length === 0) return Promise.resolve([]);
    return db
      .select()
      .from(cardStates)
      .where(and(eq(cardStates.workspaceId, ws), inArray(cardStates.cardId, cardIds)))
      .orderBy(asc(cardStates.ordinal));
  },

  async insertStates(db: DbExecutor, ws: string, cardId: string, ordinals: number[], state: MemoryState) {
    if (ordinals.length === 0) return;
    await db.insert(cardStates).values(ordinals.map((ordinal) => ({ workspaceId: ws, cardId, ordinal, ...state })));
  },

  /** Removes the items a card no longer produces (a deletion number taken out of a cloze, say). */
  async deleteStatesExcept(db: DbExecutor, ws: string, cardId: string, keep: number[]) {
    await db
      .delete(cardStates)
      .where(
        and(
          eq(cardStates.workspaceId, ws),
          eq(cardStates.cardId, cardId),
          keep.length > 0 ? notInArray(cardStates.ordinal, keep) : undefined,
        ),
      );
    await db
      .delete(cardReviews)
      .where(
        and(
          eq(cardReviews.workspaceId, ws),
          eq(cardReviews.cardId, cardId),
          keep.length > 0 ? notInArray(cardReviews.ordinal, keep) : undefined,
        ),
      );
  },

  /** One item's state, locked until the transaction ends, so two ratings can't race. */
  async lockState(db: DbExecutor, ws: string, cardId: string, ordinal: number) {
    const rows = await db
      .select()
      .from(cardStates)
      .where(and(eq(cardStates.workspaceId, ws), eq(cardStates.cardId, cardId), eq(cardStates.ordinal, ordinal)))
      .for("update")
      .limit(1);
    return rows[0] ?? null;
  },

  async saveState(db: DbExecutor, ws: string, cardId: string, ordinal: number, state: MemoryState) {
    await db
      .update(cardStates)
      .set({ ...state, updatedAt: new Date() })
      .where(and(eq(cardStates.workspaceId, ws), eq(cardStates.cardId, cardId), eq(cardStates.ordinal, ordinal)));
  },

  // ── reviews ───────────────────────────────────────────────────────────────
  /** Records a rating; false when a rating with this id was already recorded. */
  async insertReview(db: DbExecutor, row: typeof cardReviews.$inferInsert) {
    const rows = await db.insert(cardReviews).values(row).onConflictDoNothing().returning({ id: cardReviews.id });
    return rows.length > 0;
  },

  async findReview(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .select()
      .from(cardReviews)
      .where(and(eq(cardReviews.workspaceId, ws), eq(cardReviews.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** The id of the latest rating of one item. */
  async latestReviewId(db: DbExecutor, ws: string, cardId: string, ordinal: number) {
    const rows = await db
      .select({ id: cardReviews.id })
      .from(cardReviews)
      .where(and(eq(cardReviews.workspaceId, ws), eq(cardReviews.cardId, cardId), eq(cardReviews.ordinal, ordinal)))
      .orderBy(desc(cardReviews.reviewedAt), desc(cardReviews.id))
      .limit(1);
    return rows[0]?.id ?? null;
  },

  async deleteReview(db: DbExecutor, ws: string, id: string) {
    await db.delete(cardReviews).where(and(eq(cardReviews.workspaceId, ws), eq(cardReviews.id, id)));
  },

  listReviews(db: DbExecutor, ws: string, cardId: string) {
    return db
      .select({
        ordinal: cardReviews.ordinal,
        rating: cardReviews.rating,
        reviewedAt: cardReviews.reviewedAt,
        stateBefore: cardReviews.stateBefore,
      })
      .from(cardReviews)
      .where(and(eq(cardReviews.workspaceId, ws), eq(cardReviews.cardId, cardId)))
      .orderBy(desc(cardReviews.reviewedAt));
  },

  /** How many new items were started, and how many reviews done, since `since` (the start of the day). */
  async reviewedSince(db: DbExecutor, ws: string, since: Date) {
    const [row] = await db
      .select({
        newStarted: sql<number>`count(*) filter (where ${cardReviews.stateBefore} = 'new')`.mapWith(Number),
        reviews: sql<number>`count(*) filter (where ${cardReviews.stateBefore} = 'review')`.mapWith(Number),
        total: count(),
      })
      .from(cardReviews)
      .where(and(eq(cardReviews.workspaceId, ws), gte(cardReviews.reviewedAt, since)));
    return { newStarted: row?.newStarted ?? 0, reviews: row?.reviews ?? 0, total: row?.total ?? 0 };
  },

  // ── review queue ──────────────────────────────────────────────────────────
  /** Items in their learning steps that are due by `cutoff`. */
  learningDue(db: DbExecutor, ws: string, scope: Scope, cutoff: Date, limit: number) {
    return itemsQuery(
      db,
      ws,
      scope,
      and(or(eq(cardStates.state, "learning"), eq(cardStates.state, "relearning")), lte(cardStates.due, cutoff)),
    )
      .orderBy(asc(cardStates.due))
      .limit(limit);
  },

  /** Review items due by `cutoff` (the end of the student's day), most overdue first. */
  reviewsDue(db: DbExecutor, ws: string, scope: Scope, cutoff: Date, limit: number) {
    return itemsQuery(db, ws, scope, and(eq(cardStates.state, "review"), lte(cardStates.due, cutoff)))
      .orderBy(asc(cardStates.due))
      .limit(limit);
  },

  /** New items in the order their cards were added, a card's items together. */
  newItems(db: DbExecutor, ws: string, scope: Scope, limit: number) {
    if (limit <= 0) return Promise.resolve([]);
    return itemsQuery(db, ws, scope, eq(cardStates.state, "new"))
      .orderBy(asc(cards.createdAt), asc(cards.id), asc(cardStates.ordinal))
      .limit(limit);
  },

  /** Counts for a scope: new items, items due today, and items still in their learning steps. */
  async countItems(db: DbExecutor, ws: string, scope: Scope, opts: { learningCutoff: Date; reviewCutoff: Date }) {
    const [row] = await db
      .select({
        newItems: sql<number>`count(*) filter (where ${cardStates.state} = 'new')`.mapWith(Number),
        reviewDue:
          sql<number>`count(*) filter (where ${cardStates.state} = 'review' and ${cardStates.due} <= ${opts.reviewCutoff})`.mapWith(
            Number,
          ),
        learningDue:
          sql<number>`count(*) filter (where ${cardStates.state} in ('learning', 'relearning') and ${cardStates.due} <= ${opts.learningCutoff})`.mapWith(
            Number,
          ),
        learning: sql<number>`count(*) filter (where ${cardStates.state} in ('learning', 'relearning'))`.mapWith(
          Number,
        ),
        total: count(),
      })
      .from(cardStates)
      .innerJoin(cards, and(eq(cards.id, cardStates.cardId), eq(cards.workspaceId, cardStates.workspaceId)))
      .where(and(eq(cardStates.workspaceId, ws), isNull(cards.suspendedAt), scopeFilter(ws, scope)));
    return {
      newItems: row?.newItems ?? 0,
      reviewDue: row?.reviewDue ?? 0,
      learningDue: row?.learningDue ?? 0,
      learning: row?.learning ?? 0,
      total: row?.total ?? 0,
    };
  },

  /** Items waiting per subject (not archived): new items, and items due by the cutoffs. */
  async countBySubject(db: DbExecutor, ws: string, opts: { learningCutoff: Date; reviewCutoff: Date }) {
    return db
      .select({
        subjectId: cards.subjectId,
        newItems: sql<number>`count(*) filter (where ${cardStates.state} = 'new')`.mapWith(Number),
        reviewDue:
          sql<number>`count(*) filter (where ${cardStates.state} = 'review' and ${cardStates.due} <= ${opts.reviewCutoff})`.mapWith(
            Number,
          ),
        learningDue:
          sql<number>`count(*) filter (where ${cardStates.state} in ('learning', 'relearning') and ${cardStates.due} <= ${opts.learningCutoff})`.mapWith(
            Number,
          ),
      })
      .from(cardStates)
      .innerJoin(cards, and(eq(cards.id, cardStates.cardId), eq(cards.workspaceId, cardStates.workspaceId)))
      .where(and(eq(cardStates.workspaceId, ws), isNull(cards.suspendedAt), scopeFilter(ws, {})))
      .groupBy(cards.subjectId);
  },

  /** When the next item in a scope falls due after `after`, for "nothing due until …". */
  async nextDue(db: DbExecutor, ws: string, scope: Scope, after: Date) {
    const rows = await itemsQuery(db, ws, scope, and(ne(cardStates.state, "new"), gte(cardStates.due, after)))
      .orderBy(asc(cardStates.due))
      .limit(1);
    return rows[0]?.due ?? null;
  },

  // ── search ────────────────────────────────────────────────────────────────
  /** Cards matching a query, best first, with a highlighted snippet of the front. */
  async search(db: DbExecutor, ws: string, q: { tsquery: string | null; subjectId?: string; limit: number }) {
    if (!q.tsquery) return [];
    const tsq = sql`to_tsquery('english', ${q.tsquery})`;
    const subject = q.subjectId ? sql`and ${cards.subjectId} = ${q.subjectId}` : sql``;
    const result = await db.execute(sql`
      select m.id, m.subject_id, m.type, m.front,
             ts_headline('english', m.front || ' ' || m.back, ${tsq}, ${HEADLINE_OPTIONS}) as headline
      from (
        select ${cards.id} as id, ${cards.subjectId} as subject_id, ${cards.type} as type,
               ${cards.front} as front, ${cards.back} as back,
               ts_rank_cd(${cards.searchVector}, ${tsq}) as score, ${cards.createdAt} as created_at
        from ${cards}
        where ${cards.workspaceId} = ${ws} ${subject} and ${cards.searchVector} @@ ${tsq}
        order by score desc, ${cards.createdAt} desc
        limit ${q.limit}
      ) m
      order by m.score desc, m.created_at desc
    `);
    return (
      result.rows as {
        id: string;
        subject_id: string;
        type: "basic" | "reverse" | "cloze";
        front: string;
        headline: string;
      }[]
    ).map((r) => ({ id: r.id, subjectId: r.subject_id, type: r.type, front: r.front, headline: r.headline }));
  },
};
