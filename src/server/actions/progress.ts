"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { progressService } from "@/server/modules/progress/service";
import { logFocusSessionSchema } from "@/server/modules/progress/schemas";

/** Thin transport layer for the progress module: validation, auth and error mapping live in `action()`. */

export const logFocusSession = action(logFocusSessionSchema, async (ctx, input) => {
  const result = await progressService.logFocusSession(ctx, input);
  revalidatePath("/today");
  revalidatePath("/progress");
  revalidatePath("/focus");
  return result;
});
