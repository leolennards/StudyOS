/**
 * Typed application errors (Architecture §34). Each carries a stable code and
 * a message that is safe to show the user. Internal detail stays in `cause`
 * and is only ever logged.
 */
export type ErrorCode =
  "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL";

const defaultMessages: Record<ErrorCode, string> = {
  VALIDATION: "Some of the details aren't valid. Check the highlighted fields.",
  UNAUTHENTICATED: "Your session has ended. Sign in again to continue.",
  FORBIDDEN: "You don't have access to that.",
  NOT_FOUND: "We couldn't find that. It may have been deleted.",
  CONFLICT: "That conflicts with something that already exists.",
  RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
  INTERNAL: "Something went wrong on our side. Please try again.",
};

export type FieldErrors = Record<string, string[] | undefined>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: FieldErrors;

  constructor(code: ErrorCode, message?: string, options?: { fields?: FieldErrors; cause?: unknown }) {
    super(message ?? defaultMessages[code], { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.fields = options?.fields;
  }
}

export const notFound = (what = "That item") =>
  new AppError("NOT_FOUND", `${what} couldn't be found. It may have been deleted.`);

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/** Postgres unique-violation, used to turn duplicate inserts into a CONFLICT. */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
