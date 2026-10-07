import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import {
  cardReviews,
  cards,
  cardStates,
  cardTopics,
  studySessions,
  subjects,
  topics,
} from "@/server/platform/db/schema";
import { REVIEW_SECONDS_CAP } from "./domain/limits";

/**
 * All SQL for the progress module (Architecture §29). Student analytics are
 * computed on the fly from what is already recorded: focus sessions and
 * flashcard ratings. Every query is scoped by workspace id.
 *
 * Study time is focus time plus time on flashcards. A rating made while a
 * focus session was running is already inside that session, so it adds no
 * time of its own, only activity.
 */
export type SessionInsert = typeof studySessions.$inferInsert;

/** Seconds a rating adds to the day: its time on screen, capped, unless a focus session covers it. */
const reviewSeconds = sql`case when exists (
    select 1 from ${studySessions} focus
    where focus.workspace_id = ${cardReviews.workspaceId}
      and ${cardReviews.reviewedAt} between focus.started_at and focus.ended_at
  ) then 0 else least(coalesce(${cardReviews.durationMs}, 0), ${REVIEW_SECONDS_CAP * 1000}) / 1000.0 end`;

const num = (v: unknown) => Number(v ?? 0);

export const progressRepository = {
  // ── focus sessions ────────────────────────────────────────────────────────
  /** Records a session once; returns false if a session with this id already exists. */
  async insertSession(db: DbExecutor, row: SessionInsert) {
    const rows = await db
      .insert(studySessions)
      .values(row)
      .onConflictDoNothing({ target: studySessions.id })
      .returning({ id: studySessions.id });
    return rows.length > 0;
  },

  async findSession(db: DbExecutor, ws: string, id: string) {
    const rows = await db
      .select()
      .from(studySessions)
      .where(sql`${studySessions.id} = ${id} and ${studySessions.workspaceId} = ${ws}`)
      .limit(1);
    return rows[0] ?? null;
  },

  // ── study time ────────────────────────────────────────────────────────────
  /**
   * Study per local day in the zone, from `since` (all time if null): the
   * seconds studied, the focus seconds among them, and how many ratings
   * and sessions there were.
   */
  async dailyStudy(db: DbExecutor, ws: string, timeZone: string, since: Date | null) {
    const reviewSince = since ? sql`and ${cardReviews.reviewedAt} >= ${since}` : sql``;
    const sessionSince = since ? sql`and ${studySessions.startedAt} >= ${since}` : sql``;
    const result = await db.execute(sql`
      select to_char(day, 'YYYY-MM-DD') as day,
             sum(seconds) as seconds, sum(focus_seconds) as focus_seconds,
             sum(ratings) as ratings, sum(sessions) as sessions
      from (
        select (${cardReviews.reviewedAt} at time zone ${timeZone})::date as day,
               sum(${reviewSeconds}) as seconds, 0 as focus_seconds, count(*) as ratings, 0 as sessions
        from ${cardReviews}
        where ${cardReviews.workspaceId} = ${ws} ${reviewSince}
        group by 1
        union all
        select (${studySessions.startedAt} at time zone ${timeZone})::date,
               sum(${studySessions.focusedSeconds}), sum(${studySessions.focusedSeconds}), 0, count(*)
        from ${studySessions}
        where ${studySessions.workspaceId} = ${ws} ${sessionSince}
        group by 1
      ) days
      group by day
      order by day
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({
      day: String(r.day),
      seconds: num(r.seconds),
      focusSeconds: num(r.focus_seconds),
      ratings: num(r.ratings),
      sessions: num(r.sessions),
    }));
  },

  /** Study time per subject since `since`. A null subject is focus time not tied to a subject. */
  async subjectTime(db: DbExecutor, ws: string, since: Date) {
    const result = await db.execute(sql`
      select t.subject_id, s.name, s.colour, sum(t.seconds) as seconds
      from (
        select ${studySessions.subjectId} as subject_id, sum(${studySessions.focusedSeconds}) as seconds
        from ${studySessions}
        where ${studySessions.workspaceId} = ${ws} and ${studySessions.startedAt} >= ${since}
        group by 1
        union all
        select ${cards.subjectId}, sum(${reviewSeconds})
        from ${cardReviews}
        join ${cards} on ${cards.id} = ${cardReviews.cardId} and ${cards.workspaceId} = ${cardReviews.workspaceId}
        where ${cardReviews.workspaceId} = ${ws} and ${cardReviews.reviewedAt} >= ${since}
        group by 1
      ) t
      left join ${subjects} s on s.id = t.subject_id and s.workspace_id = ${ws}
      where t.subject_id is null or s.archived_at is null
      group by t.subject_id, s.name, s.colour
      having sum(t.seconds) > 0
      order by seconds desc
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({
      subjectId: (r.subject_id as string | null) ?? null,
      name: (r.name as string | null) ?? null,
      colour: (r.colour as string | null) ?? null,
      seconds: num(r.seconds),
    }));
  },

  // ── flashcard ratings ─────────────────────────────────────────────────────
  /**
   * Ratings since `since`: how many there were, and of the reviews of cards
   * already learned, how many were remembered (anything but Again). That
   * share is the student's real recall, to set against their target.
   */
  async recall(db: DbExecutor, ws: string, since: Date) {
    const [row] = await db
      .select({
        ratings: sql<number>`count(*)`.mapWith(Number),
        reviews: sql<number>`count(*) filter (where ${cardReviews.stateBefore} = 'review')`.mapWith(Number),
        remembered:
          sql<number>`count(*) filter (where ${cardReviews.stateBefore} = 'review' and ${cardReviews.rating} > 1)`.mapWith(
            Number,
          ),
      })
      .from(cardReviews)
      .where(sql`${cardReviews.workspaceId} = ${ws} and ${cardReviews.reviewedAt} >= ${since}`);
    return { ratings: row?.ratings ?? 0, reviews: row?.reviews ?? 0, remembered: row?.remembered ?? 0 };
  },

  /**
   * Topics by how often their cards were forgotten since `since`, worst
   * first. Only ratings of cards already seen count, and only topics with
   * at least `minRatings` of them, so one bad review doesn't flag a topic.
   */
  async topicRecall(db: DbExecutor, ws: string, q: { since: Date; minRatings: number; limit: number }) {
    const result = await db.execute(sql`
      select ${topics.id} as topic_id, ${topics.name} as topic_name,
             ${subjects.id} as subject_id, ${subjects.name} as subject_name, ${subjects.colour} as colour,
             count(*) as ratings, count(*) filter (where ${cardReviews.rating} = 1) as forgot
      from ${cardReviews}
      join ${cardTopics} on ${cardTopics.cardId} = ${cardReviews.cardId} and ${cardTopics.workspaceId} = ${ws}
      join ${topics} on ${topics.id} = ${cardTopics.topicId} and ${topics.workspaceId} = ${ws}
      join ${subjects} on ${subjects.id} = ${topics.subjectId} and ${subjects.workspaceId} = ${ws}
      where ${cardReviews.workspaceId} = ${ws}
        and ${cardReviews.reviewedAt} >= ${q.since}
        and ${cardReviews.stateBefore} <> 'new'
        and ${subjects.archivedAt} is null
      group by ${topics.id}, ${topics.name}, ${subjects.id}, ${subjects.name}, ${subjects.colour}
      having count(*) >= ${q.minRatings}
      order by count(*) filter (where ${cardReviews.rating} = 1)::float / count(*) desc, count(*) desc
      limit ${q.limit}
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({
      topicId: String(r.topic_id),
      topicName: String(r.topic_name),
      subjectId: String(r.subject_id),
      subjectName: String(r.subject_name),
      colour: String(r.colour),
      ratings: num(r.ratings),
      forgot: num(r.forgot),
    }));
  },

  /**
   * Cards already learned that fall due before `until`, per local day.
   * Anything overdue counts on the day of `now`.
   */
  async dueByDay(db: DbExecutor, ws: string, q: { timeZone: string; now: Date; until: Date }) {
    const result = await db.execute(sql`
      select to_char((greatest(${cardStates.due}, ${q.now}) at time zone ${q.timeZone})::date, 'YYYY-MM-DD') as day,
             count(*) as items
      from ${cardStates}
      join ${cards} on ${cards.id} = ${cardStates.cardId} and ${cards.workspaceId} = ${cardStates.workspaceId}
      join ${subjects} on ${subjects.id} = ${cards.subjectId} and ${subjects.workspaceId} = ${ws}
      where ${cardStates.workspaceId} = ${ws}
        and ${cards.suspendedAt} is null
        and ${subjects.archivedAt} is null
        and ${cardStates.state} <> 'new'
        and ${cardStates.due} < ${q.until}
      group by 1
      order by 1
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({ day: String(r.day), items: num(r.items) }));
  },
};
