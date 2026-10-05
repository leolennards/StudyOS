import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { AppError, isAppError, notFound } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { parseHighlights, type SearchInput } from "@/server/lib/search-query";
import { getDb, withTransaction } from "@/server/platform/db/client";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { libraryService } from "@/server/modules/library/service";
import { notesService } from "@/server/modules/notes/service";
import { settingsService } from "@/server/modules/settings/service";
import { endOfDay, startOfDay } from "./domain/day";
import { cardOrdinals, cardPreview, cardProblem, type CardType, itemLabel } from "./domain/items";
import { CARD_LIST_MAX, LEARN_AHEAD_MINUTES, REVIEW_BATCH } from "./domain/limits";
import { orderQueue } from "./domain/queue";
import {
  elapsedDays,
  type MemoryState,
  newMemoryState,
  type Rating,
  retrievability,
  schedule,
} from "./domain/scheduler";
import { flashcardsRepository as repo, type Scope, type StateRow } from "./repository";
import type {
  cardIdSchema,
  createCardSchema,
  reviewCardSchema,
  reviewScopeSchema,
  setCardSuspendedSchema,
  undoReviewSchema,
  updateCardSchema,
} from "./schemas";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Flashcards module (Architecture §20, §21): cards a student writes, linked
 * to a subject and its topics, reviewed on an FSRS schedule. Every function
 * requires a RequestContext and only touches its workspace. Every card made
 * here has origin `user`; generated cards come in a later phase.
 */

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

async function requireCard(ctx: RequestContext, id: string) {
  const card = await repo.findCard(getDb(), ctx.workspaceId, id);
  if (!card) throw notFound("That card");
  return card;
}

/** Topics of the card's subject, de-duplicated, or a clear error. */
async function checkTopics(ctx: RequestContext, subjectId: string, topicIds: string[]) {
  const unique = [...new Set(topicIds)];
  if (unique.length === 0) return unique;
  const found = await knowledgeService.findTopics(ctx, unique);
  if (found.length !== unique.length || found.some((t) => t.subjectId !== subjectId)) {
    throw new AppError("VALIDATION", "Some of those topics aren't part of this subject.");
  }
  return unique;
}

/** The card's text, trimmed and checked, or a clear error. */
function checkContent(input: { type: CardType; front: string; back: string }) {
  const content = { type: input.type, front: input.front.trim(), back: input.back.trim() };
  const problem = cardProblem(content);
  if (problem) throw new AppError("VALIDATION", problem, { fields: { front: [problem] } });
  return content;
}

/** Checks a card's source belongs to the same subject (and workspace), returning what to store. */
async function checkSource(ctx: RequestContext, subjectId: string, input: In<typeof createCardSchema>) {
  const none = { sourceNoteId: null, sourceDocumentId: null, sourcePage: null };
  const wrong = () => new AppError("VALIDATION", "That source isn't part of this subject.");
  if (input.sourceNoteId) {
    const note = await notesService.getNote(ctx, input.sourceNoteId).catch(() => null);
    if (!note || note.subjectId !== subjectId) throw wrong();
    return { ...none, sourceNoteId: note.id };
  }
  if (input.sourceDocumentId) {
    const doc = await libraryService.getDocument(ctx, input.sourceDocumentId).catch(() => null);
    if (!doc || doc.subjectId !== subjectId) throw wrong();
    const page = input.sourcePage ?? null;
    if (page !== null && doc.pageCount !== null && page > doc.pageCount) {
      throw new AppError("VALIDATION", "That page isn't in the document.");
    }
    return { ...none, sourceDocumentId: doc.id, sourcePage: page };
  }
  return none;
}

const toMemory = (s: Pick<StateRow, keyof MemoryState>): MemoryState => ({
  due: s.due,
  stability: s.stability,
  difficulty: s.difficulty,
  elapsedDays: s.elapsedDays,
  scheduledDays: s.scheduledDays,
  learningSteps: s.learningSteps,
  reps: s.reps,
  lapses: s.lapses,
  state: s.state,
  lastReview: s.lastReview,
});

/** A memory state as stored in a review's `previous` column, so it can be put back by an undo. */
const serialiseMemory = (s: MemoryState) => ({
  ...s,
  due: s.due.toISOString(),
  lastReview: s.lastReview?.toISOString() ?? null,
});

function parseMemory(value: unknown): MemoryState {
  const v = value as ReturnType<typeof serialiseMemory>;
  return { ...v, due: new Date(v.due), lastReview: v.lastReview ? new Date(v.lastReview) : null };
}

/** Cloze markup is noise in a search snippet; show the answers as plain text. */
const stripCloze = (text: string) =>
  text
    .replace(/\{\{c\d+::/g, "")
    .replace(/::[^}]*\}\}/g, "")
    .replace(/\}\}/g, "");

/** The student's day and review settings, which every scheduling read needs. */
async function reviewContext(ctx: RequestContext, now: Date) {
  const settings = await settingsService.get(ctx);
  const dayStart = startOfDay(now, settings.timezone);
  const dayEnd = endOfDay(now, settings.timezone);
  const done = await repo.reviewedSince(getDb(), ctx.workspaceId, dayStart);
  return {
    settings,
    dayEnd,
    learningCutoff: new Date(now.getTime() + LEARN_AHEAD_MINUTES * 60_000),
    newRemaining: Math.max(0, settings.newCardsPerDay - done.newStarted),
    reviewsRemaining: Math.max(0, settings.reviewsPerDay - done.reviews),
    reviewedToday: done.total,
  };
}

async function checkScope(ctx: RequestContext, scope: Scope) {
  if (scope.topicId) {
    const [topic] = await knowledgeService.findTopics(ctx, [scope.topicId]);
    if (!topic) throw notFound("That topic");
    if (scope.subjectId && topic.subjectId !== scope.subjectId) throw notFound("That topic");
    return { subjectId: topic.subjectId, topicId: topic.id };
  }
  if (scope.subjectId) await knowledgeService.getSubject(ctx, scope.subjectId);
  return { subjectId: scope.subjectId };
}

/** The titles of the notes and documents cards were made from; sources since deleted are left out. */
async function sourceTitles(
  ctx: RequestContext,
  rows: { sourceNoteId: string | null; sourceDocumentId: string | null }[],
) {
  const noteIds = [...new Set(rows.map((r) => r.sourceNoteId).filter((id): id is string => id !== null))];
  const docIds = [...new Set(rows.map((r) => r.sourceDocumentId).filter((id): id is string => id !== null))];
  const quiet = <T>(p: Promise<T>) =>
    p.catch((e) => {
      if (isAppError(e) && e.code === "NOT_FOUND") return null;
      throw e;
    });
  const [notes, docs] = await Promise.all([
    Promise.all(noteIds.map((id) => quiet(notesService.getNote(ctx, id)))),
    Promise.all(docIds.map((id) => quiet(libraryService.getDocument(ctx, id)))),
  ]);
  return {
    notes: new Map(notes.filter((n) => n !== null).map((n) => [n.id, n.title.trim() || "Untitled note"])),
    documents: new Map(docs.filter((d) => d !== null).map((d) => [d.id, d.title])),
  };
}

type CardWithItems = NonNullable<Awaited<ReturnType<typeof repo.findCard>>>;

function cardView(
  card: CardWithItems,
  states: StateRow[],
  topics: { id: string; name: string }[],
  titles: Awaited<ReturnType<typeof sourceTitles>>,
  now: Date,
  retention: number,
) {
  const items = states.map((s) => {
    const memory = toMemory(s);
    return {
      ordinal: s.ordinal,
      label: itemLabel(card.type, s.ordinal),
      state: s.state,
      due: s.due,
      reps: s.reps,
      lapses: s.lapses,
      retrievability: retrievability(memory, now, { retention }),
    };
  });
  const scheduled = items.filter((i) => i.state !== "new");
  const noteTitle = card.sourceNoteId ? titles.notes.get(card.sourceNoteId) : undefined;
  const docTitle = card.sourceDocumentId ? titles.documents.get(card.sourceDocumentId) : undefined;
  return {
    id: card.id,
    subjectId: card.subjectId,
    type: card.type,
    front: card.front,
    back: card.back,
    preview: cardPreview(card),
    suspended: card.suspendedAt !== null,
    createdAt: card.createdAt,
    topics,
    items,
    isNew: scheduled.length === 0,
    nextDue: scheduled.length > 0 ? new Date(Math.min(...scheduled.map((i) => i.due.getTime()))) : null,
    source:
      card.sourceNoteId && noteTitle !== undefined
        ? { kind: "note" as const, id: card.sourceNoteId, title: noteTitle }
        : card.sourceDocumentId && docTitle !== undefined
          ? { kind: "document" as const, id: card.sourceDocumentId, title: docTitle, page: card.sourcePage }
          : null,
  };
}

export type CardView = ReturnType<typeof cardView>;

export const flashcardsService = {
  // ── cards ─────────────────────────────────────────────────────────────────
  /** A subject's cards, newest first, optionally only one topic's, with each item's schedule. */
  async listCards(ctx: RequestContext, input: { subjectId: string; topicId?: string }, now = new Date()) {
    const scope = await checkScope(ctx, input);
    const db = getDb();
    const [rows, topics, settings] = await Promise.all([
      repo.listCards(db, ctx.workspaceId, { subjectId: input.subjectId, topicId: scope.topicId }, CARD_LIST_MAX + 1),
      knowledgeService.listTopics(ctx, input.subjectId),
      settingsService.get(ctx),
    ]);
    const shown = rows.slice(0, CARD_LIST_MAX);
    const ids = shown.map((r) => r.id);
    const [states, links, titles] = await Promise.all([
      repo.listStates(db, ctx.workspaceId, ids),
      repo.listTopicLinks(db, ctx.workspaceId, ids),
      sourceTitles(ctx, shown),
    ]);
    const topicName = new Map(topics.map((t) => [t.id, t.name]));
    return {
      cards: shown.map((card) =>
        cardView(
          card,
          states.filter((s) => s.cardId === card.id),
          links
            .filter((l) => l.cardId === card.id)
            .map((l) => ({ id: l.topicId, name: topicName.get(l.topicId) ?? "" }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          titles,
          now,
          settings.desiredRetention,
        ),
      ),
      truncated: rows.length > CARD_LIST_MAX,
    };
  },

  async getCard(ctx: RequestContext, id: string, now = new Date()) {
    const card = await requireCard(ctx, id);
    const db = getDb();
    const [states, links, titles, topics, settings] = await Promise.all([
      repo.listStates(db, ctx.workspaceId, [card.id]),
      repo.listTopicLinks(db, ctx.workspaceId, [card.id]),
      sourceTitles(ctx, [card]),
      knowledgeService.listTopics(ctx, card.subjectId),
      settingsService.get(ctx),
    ]);
    const topicName = new Map(topics.map((t) => [t.id, t.name]));
    return cardView(
      card,
      states,
      links.map((l) => ({ id: l.topicId, name: topicName.get(l.topicId) ?? "" })),
      titles,
      now,
      settings.desiredRetention,
    );
  },

  async countCards(ctx: RequestContext, subjectId?: string) {
    return repo.countCards(getDb(), ctx.workspaceId, subjectId);
  },

  /** Adds a card to a subject. Each of its items starts new, due straight away. */
  async createCard(ctx: RequestContext, input: In<typeof createCardSchema>) {
    assertCanWrite(ctx);
    await knowledgeService.getSubject(ctx, input.subjectId);
    const content = checkContent(input);
    const topicIds = await checkTopics(ctx, input.subjectId, input.topicIds ?? []);
    const source = await checkSource(ctx, input.subjectId, input);
    const id = newId();
    const now = new Date();
    await withTransaction(async (tx) => {
      await repo.insertCard(tx, {
        id,
        workspaceId: ctx.workspaceId,
        subjectId: input.subjectId,
        ...content,
        ...source,
      });
      await repo.insertStates(tx, ctx.workspaceId, id, cardOrdinals(content), newMemoryState(now));
      await repo.replaceTopicLinks(tx, ctx.workspaceId, id, topicIds);
    });
    return { id, subjectId: input.subjectId };
  },

  /**
   * Edits a card. Items it still produces keep their schedule and history;
   * items it no longer produces (a cloze deletion removed, or a reversed card
   * made basic) are removed; items it newly produces start new.
   */
  async updateCard(ctx: RequestContext, input: In<typeof updateCardSchema>) {
    assertCanWrite(ctx);
    const card = await requireCard(ctx, input.id);
    const content = checkContent(input);
    const topicIds = input.topicIds ? await checkTopics(ctx, card.subjectId, input.topicIds) : null;
    const ordinals = cardOrdinals(content);
    await withTransaction(async (tx) => {
      await repo.updateCard(tx, ctx.workspaceId, card.id, content);
      const existing = await repo.listStates(tx, ctx.workspaceId, [card.id]);
      await repo.deleteStatesExcept(tx, ctx.workspaceId, card.id, ordinals);
      const have = new Set(existing.map((s) => s.ordinal));
      await repo.insertStates(
        tx,
        ctx.workspaceId,
        card.id,
        ordinals.filter((o) => !have.has(o)),
        newMemoryState(new Date()),
      );
      if (topicIds) await repo.replaceTopicLinks(tx, ctx.workspaceId, card.id, topicIds);
    });
    return { id: card.id, subjectId: card.subjectId };
  },

  /** Suspends a card (kept with its history, never shown for review) or brings it back. */
  async setSuspended(ctx: RequestContext, input: In<typeof setCardSuspendedSchema>) {
    assertCanWrite(ctx);
    const card = await requireCard(ctx, input.id);
    if (input.suspended !== (card.suspendedAt !== null)) {
      await repo.updateCard(getDb(), ctx.workspaceId, card.id, { suspendedAt: input.suspended ? new Date() : null });
    }
    return { id: card.id, subjectId: card.subjectId };
  },

  /** Deletes a card and its review history for good. */
  async deleteCard(ctx: RequestContext, input: In<typeof cardIdSchema>) {
    assertCanWrite(ctx);
    const card = await requireCard(ctx, input.id);
    await repo.deleteCard(getDb(), ctx.workspaceId, card.id);
    return { id: card.id, subjectId: card.subjectId };
  },

  // ── review ────────────────────────────────────────────────────────────────
  /**
   * What is waiting in a scope today, after the daily limits: items due
   * (learning steps and reviews) and new items the student can start.
   */
  async getOverview(ctx: RequestContext, input: In<typeof reviewScopeSchema> = {}, now = new Date()) {
    const scope = await checkScope(ctx, input);
    const rc = await reviewContext(ctx, now);
    const counts = await repo.countItems(getDb(), ctx.workspaceId, scope, {
      learningCutoff: rc.learningCutoff,
      reviewCutoff: rc.dayEnd,
    });
    const due = counts.learningDue + Math.min(counts.reviewDue, rc.reviewsRemaining);
    const fresh = Math.min(counts.newItems, rc.newRemaining);
    const nextDue = due + fresh === 0 ? await repo.nextDue(getDb(), ctx.workspaceId, scope, now) : null;
    return {
      due,
      new: fresh,
      total: counts.total,
      reviewedToday: rc.reviewedToday,
      /** New items held back by today's limit. */
      newHeldBack: counts.newItems - fresh,
      /** Reviews held back by today's limit. */
      reviewsHeldBack: counts.reviewDue - Math.min(counts.reviewDue, rc.reviewsRemaining),
      nextDue,
    };
  },

  /**
   * What is waiting in each subject today. Daily limits are shared by all
   * subjects, so each count is capped at what is left of today's limit.
   */
  async getSubjectCounts(ctx: RequestContext, now = new Date()) {
    const rc = await reviewContext(ctx, now);
    const rows = await repo.countBySubject(getDb(), ctx.workspaceId, {
      learningCutoff: rc.learningCutoff,
      reviewCutoff: rc.dayEnd,
    });
    return new Map(
      rows.map((r) => [
        r.subjectId,
        {
          due: r.learningDue + Math.min(r.reviewDue, rc.reviewsRemaining),
          new: Math.min(r.newItems, rc.newRemaining),
        },
      ]),
    );
  },

  /**
   * A review session: up to one batch of items, in order (Architecture §20).
   * Only one new item per card is started in a session, so a reversed card's
   * two directions or a cloze card's deletions aren't asked back to back.
   */
  async getSession(ctx: RequestContext, input: In<typeof reviewScopeSchema> = {}, now = new Date()) {
    const scope = await checkScope(ctx, input);
    const rc = await reviewContext(ctx, now);
    const db = getDb();
    const [learning, reviews, freshRows] = await Promise.all([
      repo.learningDue(db, ctx.workspaceId, scope, rc.learningCutoff, REVIEW_BATCH),
      repo.reviewsDue(db, ctx.workspaceId, scope, rc.dayEnd, Math.min(rc.reviewsRemaining, REVIEW_BATCH)),
      repo.newItems(db, ctx.workspaceId, scope, Math.min(rc.newRemaining, REVIEW_BATCH) * 3),
    ]);
    const seen = new Set([...learning, ...reviews].map((i) => i.cardId));
    const fresh = [];
    for (const item of freshRows) {
      if (fresh.length >= rc.newRemaining || seen.has(item.cardId)) continue;
      seen.add(item.cardId);
      fresh.push(item);
    }
    const ordered = orderQueue(learning, reviews, fresh);
    const items = ordered.slice(0, REVIEW_BATCH).map((i) => ({
      cardId: i.cardId,
      subjectId: i.subjectId,
      ordinal: i.ordinal,
      type: i.type,
      front: i.front,
      back: i.back,
      memory: toMemory(i),
    }));
    const overview = await this.getOverview(ctx, scope, now);
    return {
      items,
      retention: rc.settings.desiredRetention,
      /** More is waiting than this session holds (only when the batch is full). */
      more: ordered.length > REVIEW_BATCH || overview.due + overview.new > items.length,
      overview,
    };
  },

  /**
   * Records one rating and reschedules the item. The rating's id comes from
   * the browser, so if a request is retried after a dropped connection the
   * rating is recorded once and the item is scheduled once.
   */
  async reviewCard(ctx: RequestContext, input: In<typeof reviewCardSchema>, now = new Date()) {
    assertCanWrite(ctx);
    const settings = await settingsService.get(ctx);
    return withTransaction(async (tx) => {
      const card = await repo.findCard(tx, ctx.workspaceId, input.cardId);
      const row = card ? await repo.lockState(tx, ctx.workspaceId, card.id, input.ordinal) : null;
      if (!card || !row) throw notFound("That card");
      if (card.suspendedAt) throw new AppError("VALIDATION", "This card is suspended. Unsuspend it to review it.");

      const previous = toMemory(row);
      const next = schedule(previous, input.rating as Rating, now, { retention: settings.desiredRetention });
      const recorded = await repo.insertReview(tx, {
        id: input.reviewId,
        workspaceId: ctx.workspaceId,
        cardId: card.id,
        ordinal: input.ordinal,
        rating: input.rating,
        stateBefore: previous.state,
        reviewedAt: now,
        elapsedDays: elapsedDays(previous, now),
        scheduledDays: next.scheduledDays,
        durationMs: input.durationMs ?? null,
        previous: serialiseMemory(previous),
      });
      if (!recorded) {
        // Already recorded: a retry. Leave the schedule as the first request set it.
        const existing = await repo.findReview(tx, ctx.workspaceId, input.reviewId);
        if (!existing || existing.cardId !== card.id || existing.ordinal !== input.ordinal) {
          throw new AppError("CONFLICT");
        }
        return { cardId: card.id, ordinal: input.ordinal, state: row.state, due: row.due, duplicate: true };
      }
      await repo.saveState(tx, ctx.workspaceId, card.id, input.ordinal, next);
      return { cardId: card.id, ordinal: input.ordinal, state: next.state, due: next.due, duplicate: false };
    });
  },

  /** Undoes a rating, putting the item back as it was. Only an item's latest rating can be undone. */
  async undoReview(ctx: RequestContext, input: In<typeof undoReviewSchema>) {
    assertCanWrite(ctx);
    return withTransaction(async (tx) => {
      const review = await repo.findReview(tx, ctx.workspaceId, input.reviewId);
      if (!review) throw notFound("That rating");
      const row = await repo.lockState(tx, ctx.workspaceId, review.cardId, review.ordinal);
      if (!row) throw notFound("That card");
      const latest = await repo.latestReviewId(tx, ctx.workspaceId, review.cardId, review.ordinal);
      if (latest !== review.id) {
        throw new AppError("VALIDATION", "This card has been reviewed again since, so that rating can't be undone.");
      }
      await repo.saveState(tx, ctx.workspaceId, review.cardId, review.ordinal, parseMemory(review.previous));
      await repo.deleteReview(tx, ctx.workspaceId, review.id);
      return { cardId: review.cardId, ordinal: review.ordinal };
    });
  },

  // ── search ────────────────────────────────────────────────────────────────
  /** Cards matching a search, best first, each with a highlighted snippet. Used by the search module. */
  async search(ctx: RequestContext, input: SearchInput) {
    const rows = await repo.search(getDb(), ctx.workspaceId, {
      tsquery: input.tsquery,
      subjectId: input.subjectId,
      limit: input.limit,
    });
    return rows.map((r) => ({
      id: r.id,
      subjectId: r.subjectId,
      title: cardPreview({ type: r.type, front: r.front }).slice(0, 120),
      snippet: parseHighlights(r.headline ?? "").map((p) => ({ ...p, text: stripCloze(p.text) })),
    }));
  },
};
