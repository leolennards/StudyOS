import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/server/lib/env";
import { newId } from "@/server/lib/ids";
import { getDb } from "@/server/platform/db/client";
import { accounts, rateLimits, sessions, users, verifications } from "@/server/platform/db/schema";
import { actionEmail } from "@/server/platform/email";
import { logger } from "@/server/platform/observability/logger";
import { workspaceService } from "@/server/modules/workspaces/service";
import { isSignupAllowed, parseAllowedEmails } from "./signup-policy";

const e = env();
const allowedEmails = parseAllowedEmails(e.SIGNUP_ALLOWED_EMAILS);

/**
 * Authentication (ADR-004): Better Auth with users and sessions in our own
 * Postgres, httpOnly database-backed session cookies, rate-limited endpoints.
 */
export const auth = betterAuth({
  appName: "StudyOS",
  baseURL: e.BETTER_AUTH_URL,
  secret: e.BETTER_AUTH_SECRET,
  trustedOrigins: [e.BETTER_AUTH_URL],
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
  }),
  advanced: {
    database: { generateId: () => newId() },
    useSecureCookies: e.NODE_ENV === "production",
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    // Verification is required once a real email provider is configured.
    requireEmailVerification: Boolean(e.RESEND_API_KEY),
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await actionEmail({
        to: user.email,
        subject: "Reset your StudyOS password",
        intro: "Someone asked to reset the password for your StudyOS account. The link is valid for one hour.",
        actionLabel: "Choose a new password",
        url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await actionEmail({
        to: user.email,
        subject: "Confirm your email for StudyOS",
        intro: `Welcome to StudyOS, ${user.name}. Confirm your email address to finish setting up your account.`,
        actionLabel: "Confirm email",
        url,
      });
    },
  },
  socialProviders: {
    ...(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: e.MICROSOFT_CLIENT_ID,
            clientSecret: e.MICROSOFT_CLIENT_SECRET,
            tenantId: "common",
          },
        }
      : {}),
  },
  user: {
    deleteUser: {
      enabled: true,
      afterDelete: async (user) => {
        logger.info({ userId: user.id }, "account deleted");
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    // On by default; the end-to-end suite sets AUTH_RATE_LIMIT=off because it
    // signs up many accounts in a row against a production build.
    enabled: e.NODE_ENV !== "test" && process.env.AUTH_RATE_LIMIT !== "off",
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
  },
  databaseHooks: {
    user: {
      create: {
        // Applies to every way of signing up, including Google and Microsoft.
        before: async (user) => {
          if (!isSignupAllowed(user.email, allowedEmails)) {
            logger.warn("sign-up refused: email not on the allow-list");
            throw new APIError("FORBIDDEN", {
              code: "SIGN_UP_NOT_ALLOWED",
              message: "Sign-up is closed for this address.",
            });
          }
        },
        after: async (user) => {
          // Every user gets a personal workspace (ADR-005). If this fails, the
          // session resolver creates it on the next request instead.
          try {
            await workspaceService.ensurePersonalWorkspace(getDb(), user);
          } catch (error) {
            logger.error({ err: error, userId: user.id }, "failed to create personal workspace at sign-up");
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
