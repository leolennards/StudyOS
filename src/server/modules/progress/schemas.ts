import { z } from "zod";
import { FOCUS_MAX_MINUTES, FOCUS_MIN_SECONDS } from "./domain/limits";

/** A finished focus session, as the focus timer saves it. */
export const logFocusSessionSchema = z
  .object({
    /** Chosen by the browser, so a retried save is recorded once. */
    sessionId: z.uuid(),
    subjectId: z.uuid().nullable(),
    startedAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    endedAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    focusedSeconds: z
      .number()
      .int()
      .min(FOCUS_MIN_SECONDS, "Sessions under a minute aren't saved")
      .max(FOCUS_MAX_MINUTES * 60 * 2, "That session is too long"),
  })
  .refine((v) => v.endedAt >= v.startedAt, { message: "A session can't end before it starts", path: ["endedAt"] });
