/**
 * The background worker (ADR-002): the second process, started from the
 * same image as the web app with `pnpm worker`. It runs document processing
 * and housekeeping jobs from the queue and never serves pages.
 */
import { createServer } from "node:http";
import { env } from "@/server/lib/env";
import { closeDb } from "@/server/platform/db/client";
import { libreOfficePath } from "@/server/platform/convert/libreoffice";
import { getBoss, type JobPayloads, QUEUES, stopBoss } from "@/server/platform/jobs";
import { closeOcr } from "@/server/platform/ocr";
import { logger } from "@/server/platform/observability/logger";
import { libraryJobs } from "@/server/modules/library/jobs";
import { notesService } from "@/server/modules/notes/service";

const KEEP_AWAKE_INTERVAL_MS = 5 * 60_000;

async function main() {
  const e = env();
  const boss = await getBoss("worker");

  await boss.work<JobPayloads["document-process"]>(
    QUEUES.documentProcess,
    { localConcurrency: e.WORKER_CONCURRENCY },
    async ([job]) => libraryJobs.processDocument(job!),
  );
  await boss.work<JobPayloads["storage-delete"]>(QUEUES.storageDelete, async ([job]) =>
    libraryJobs.deleteStorage(job!),
  );
  await boss.work(QUEUES.storageReconcile, async () => libraryJobs.reconcileStorage());
  await boss.schedule(QUEUES.storageReconcile, "17 * * * *", {});
  // Notes that have been in the trash for 30 days are deleted for good.
  await boss.work(QUEUES.notesPurgeTrash, async () => {
    const deleted = await notesService.systemPurgeTrash();
    logger.info({ deleted }, "notes trash purged");
  });
  await boss.schedule(QUEUES.notesPurgeTrash, "41 * * * *", {});

  const soffice = libreOfficePath(e.LIBREOFFICE_PATH);
  logger.info(
    {
      concurrency: e.WORKER_CONCURRENCY,
      storage: e.STORAGE_DRIVER,
      ocr: e.OCR_ENABLED ? "tesseract" : "off",
      libreoffice: soffice ?? "not installed (Word and PowerPoint files are shown as text)",
    },
    "worker started",
  );

  // A tiny health endpoint for the host's health check (Architecture §44).
  const health = e.WORKER_HEALTH_PORT
    ? createServer((req, res) => {
        const ok = req.url === "/health";
        res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(ok ? { status: "ok" } : { error: "not found" }));
      }).listen(e.WORKER_HEALTH_PORT)
    : null;

  // On a host that sleeps after a spell without incoming requests (Render's
  // free plan stops a service after 15 minutes), the worker calls its own
  // public address while jobs are waiting or running, so it is not stopped
  // half-way through a batch. Once the queue is empty it lets itself sleep;
  // the web app wakes it again when there is new work.
  const publicUrl = e.WORKER_PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
  const keepAwake = publicUrl
    ? setInterval(async () => {
        try {
          const queues = await boss.getQueues(Object.values(QUEUES));
          const pending = queues.reduce((n, q) => n + q.queuedCount + q.activeCount, 0);
          if (pending > 0) await fetch(new URL("/health", publicUrl), { signal: AbortSignal.timeout(10_000) });
        } catch (error) {
          logger.warn({ err: error }, "keep-awake check failed");
        }
      }, KEEP_AWAKE_INTERVAL_MS)
    : null;

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "worker stopping");
    if (keepAwake) clearInterval(keepAwake);
    health?.close();
    // Lets running jobs finish; unfinished ones are retried by the next worker.
    await stopBoss();
    await closeOcr();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.fatal({ err: error }, "worker failed to start");
  process.exit(1);
});
