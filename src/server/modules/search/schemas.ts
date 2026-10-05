import { z } from "zod";
import { SEARCH_QUERY_MAX } from "@/server/lib/search-query";

/** Input for the search palette (client) and the search action (server). */
export const searchSchema = z.object({
  q: z.string().max(SEARCH_QUERY_MAX * 2),
  subjectId: z.uuid().optional(),
});

export type SearchRequest = z.input<typeof searchSchema>;
