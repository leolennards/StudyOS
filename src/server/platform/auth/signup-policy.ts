/**
 * Who may create an account. A deployment on a public address can limit
 * sign-up to a list of email addresses (SIGNUP_ALLOWED_EMAILS), so strangers
 * who find the URL cannot use its storage. An empty or unset list allows
 * everyone, which is what development and the test suites use.
 */
export function parseAllowedEmails(raw: string | undefined): Set<string> | null {
  const emails = (raw ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.length > 0 ? new Set(emails) : null;
}

export function isSignupAllowed(email: string, allowed: Set<string> | null): boolean {
  return allowed === null || allowed.has(email.trim().toLowerCase());
}
