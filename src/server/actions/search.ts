"use server";

import { action } from "@/server/lib/action";
import { searchSchema } from "@/server/modules/search/schemas";
import { searchService } from "@/server/modules/search/service";

/** The search palette's one call. Read-only; scoped to the signed-in student's workspace like every service. */
export const search = action(searchSchema, (ctx, input) => searchService.search(ctx, input));
