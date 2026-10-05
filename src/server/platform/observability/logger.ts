import pino from "pino";

/**
 * Structured JSON logs. Never log study content, passwords or tokens:
 * only ids, codes and timings.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.STUDYOS_PROCESS ?? "web" },
  redact: {
    paths: ["password", "*.password", "token", "*.token", "headers.cookie", "headers.authorization"],
    censor: "[redacted]",
  },
});
