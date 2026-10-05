import type { ErrorCode, FieldErrors } from "./errors";

/** The shape every Server Action returns to the client. */
export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string; fields?: FieldErrors } };
