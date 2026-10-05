"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth client. Talks to /api/auth on the same origin. */
export const authClient = createAuthClient();

const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Check them and try again.",
  USER_ALREADY_EXISTS: "An account with this email already exists. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Sign in instead.",
  EMAIL_NOT_VERIFIED: "Confirm your email address first. We've sent you a new link.",
  PASSWORD_TOO_SHORT: "Use at least 10 characters for your password.",
  INVALID_TOKEN: "This link has expired or was already used. Request a new one.",
  INVALID_PASSWORD: "That password isn't right.",
};

/** Turns a Better Auth error into a sentence a student can act on. */
export function authErrorMessage(error: { code?: string; status?: number; message?: string } | null | undefined) {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (error.code && messages[error.code]) return messages[error.code]!;
  return "Something went wrong. Please try again.";
}
