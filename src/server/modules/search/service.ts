import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { buildPrefixQuery, normaliseQuery } from "@/server/lib/search-query";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { libraryService } from "@/server/modules/library/service";
import { notesService } from "@/server/modules/notes/service";
import type { searchSchema } from "./schemas";

/**
 * Search module (Architecture §31): keyword search across a workspace's
 * subjects, topics, notes, flashcards and the text of its documents, all in
 * Postgres.
 * It owns no tables: each module searches its own data through its service,
 * scoped to the caller's workspace like every other read, and this module
 * prepares the query once and puts the groups together.
 */

/** Below this many characters a query matches too much to be useful. */
export const SEARCH_MIN_CHARS = 2;

const LIMITS = { subjects: 4, topics: 6, notes: 8, cards: 5, documents: 6 };

export const searchService = {
  async search(ctx: RequestContext, input: z.output<typeof searchSchema>) {
    const text = normaliseQuery(input.q);
    const empty = { query: text, subjects: [], topics: [], notes: [], cards: [], documents: [] };
    if (text.replace(/[^\p{L}\p{N}]/gu, "").length < SEARCH_MIN_CHARS) return empty;
    if (input.subjectId) await knowledgeService.getSubject(ctx, input.subjectId);

    const base = { tsquery: buildPrefixQuery(text), text, subjectId: input.subjectId };
    const [names, notes, cards, documents] = await Promise.all([
      knowledgeService.search(ctx, { ...base, limit: Math.max(LIMITS.subjects, LIMITS.topics) }),
      notesService.search(ctx, { ...base, limit: LIMITS.notes }),
      flashcardsService.search(ctx, { ...base, limit: LIMITS.cards }),
      libraryService.search(ctx, { ...base, limit: LIMITS.documents }),
    ]);
    return {
      query: text,
      subjects: names.subjects.slice(0, LIMITS.subjects),
      topics: names.topics.slice(0, LIMITS.topics),
      notes,
      cards,
      documents,
    };
  },
};

export type SearchResults = Awaited<ReturnType<typeof searchService.search>>;
