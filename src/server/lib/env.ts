import "server-only";
import { z } from "zod";

/**
 * Typed, validated environment. The app refuses to boot with missing or
 * invalid configuration instead of failing later in a confusing way.
 */
const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

const flag = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: isBuildPhase() ? z.string().default("postgres://build-placeholder") : z.string().url(),
    BETTER_AUTH_SECRET: isBuildPhase()
      ? z.string().default("build-placeholder-secret-not-used-at-runtime")
      : z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: isBuildPhase() ? z.string().default("http://localhost:3000") : z.string().url(),
    // Optional OAuth providers: the sign-in buttons only appear when both values are set.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
    // Email: with a Resend key, messages are sent. Without one they are written
    // to the server log, which production only allows if EMAIL_TRANSPORT=log
    // says so deliberately (used by the end-to-end suite).
    RESEND_API_KEY: z.string().optional(),
    EMAIL_TRANSPORT: z.enum(["resend", "log"]).optional(),
    EMAIL_FROM: z.string().default("StudyOS <no-reply@studyos.local>"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    // File storage (Architecture §8). `local` keeps files on this machine's
    // disk and is for development and tests; production uses `s3` (Cloudflare
    // R2 or any S3-compatible store), because the web and worker processes
    // run on different machines and both need the files.
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default(".data/storage"),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: flag(false),
    // Upload limits (Architecture §39).
    UPLOAD_MAX_MB: z.coerce.number().int().positive().max(500).default(50),
    STORAGE_QUOTA_MB: z.coerce.number().int().positive().default(2048),
    // Document processing in the worker.
    OCR_ENABLED: flag(true),
    LIBREOFFICE_PATH: z.string().optional(),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
    WORKER_HEALTH_PORT: z.coerce.number().int().positive().optional(),
  })
  .superRefine((env, ctx) => {
    // `next build` runs with NODE_ENV=production but without runtime secrets,
    // so production-only requirements are checked when the server starts.
    if (isBuildPhase()) return;
    if (env.NODE_ENV === "production" && !env.RESEND_API_KEY && env.EMAIL_TRANSPORT !== "log") {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message:
          "RESEND_API_KEY is required in production so verification and reset emails are delivered. Set EMAIL_TRANSPORT=log only for test environments where no email is sent.",
      });
    }
    // Local storage in production only when chosen on purpose, as with email.
    if (env.NODE_ENV === "production" && !process.env.STORAGE_DRIVER) {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_DRIVER"],
        message:
          "STORAGE_DRIVER must be set in production. Use s3 with the S3_* settings; local only works when the web and worker processes share one disk.",
      });
    }
    if (env.STORAGE_DRIVER === "s3") {
      for (const key of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[key])
          ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const oauthProviders = () => {
  const e = env();
  return {
    google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET),
  };
};
