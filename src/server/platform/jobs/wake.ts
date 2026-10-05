import { logger } from "@/server/platform/observability/logger";

/**
 * Wakes the worker when it runs on a host that sleeps while idle (the free
 * plan in docs/DEPLOYMENT.md). Any request to its address starts it; the
 * request itself may time out while it boots, which is fine, because the
 * queued jobs wait in Postgres until it is up. Without WORKER_URL (local
 * development, tests, an always-on worker) this does nothing.
 */
const WAKE_INTERVAL_MS = 60_000;
const globalForWake = globalThis as unknown as { studyosLastWake?: number };

export async function wakeWorker(): Promise<void> {
  const url = process.env.WORKER_URL;
  if (!url) return;
  const now = Date.now();
  // Callers can be frequent (status polling), so one call a minute per process is enough.
  if (globalForWake.studyosLastWake && now - globalForWake.studyosLastWake < WAKE_INTERVAL_MS) return;
  globalForWake.studyosLastWake = now;
  try {
    await fetch(new URL("/health", url), { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch (error) {
    logger.debug({ err: error }, "worker wake request did not complete (it may still be starting)");
  }
}
