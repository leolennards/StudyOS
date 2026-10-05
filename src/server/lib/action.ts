import "server-only";
import { z } from "zod";
import { AppError, isAppError, isUniqueViolation } from "./errors";
import type { ActionResult } from "./result";
import type { RequestContext } from "./context";
import { requireContext } from "@/server/platform/auth/session";
import { logger } from "@/server/platform/observability/logger";

/**
 * Wraps a service call as a Server Action (Architecture §32):
 * authenticate → validate input with zod → call the service → map errors to
 * a typed result. Every mutation from the UI goes through this.
 */
export function action<S extends z.ZodType, O>(
  schema: S,
  handler: (ctx: RequestContext, input: z.output<S>) => Promise<O>,
): (input: z.input<S>) => Promise<ActionResult<O>> {
  return async (raw) => {
    try {
      const ctx = await requireContext();
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const { fieldErrors } = z.flattenError(parsed.error);
        throw new AppError("VALIDATION", undefined, { fields: fieldErrors as Record<string, string[]> });
      }
      const data = await handler(ctx, parsed.data);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toClientError(error) };
    }
  };
}

export function toClientError(error: unknown) {
  if (isAppError(error)) {
    if (error.code === "INTERNAL") logger.error({ err: error.cause ?? error }, "internal error");
    return { code: error.code, message: error.message, fields: error.fields };
  }
  if (isUniqueViolation(error)) {
    const e = new AppError("CONFLICT");
    return { code: e.code, message: e.message };
  }
  logger.error({ err: error }, "unhandled error in action");
  const e = new AppError("INTERNAL");
  return { code: e.code, message: e.message };
}
