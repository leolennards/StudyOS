import { PgBoss, type Job, type QueueOptions, type SendOptions } from "pg-boss";
import type { SqlExecutor } from "@/server/platform/db/client";
import { logger } from "@/server/platform/observability/logger";

/**
 * The job queue (Architecture §33): pg-boss on the application's own
 * Postgres, consumed by the worker process. The web process only enqueues.
 */
export const QUEUES = {
  documentProcess: "document-process",
  storageDelete: "storage-delete",
  storageReconcile: "storage-reconcile",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type JobPayloads = {
  "document-process": { documentId: string; workspaceId: string };
  "storage-delete": { prefix: string };
  "storage-reconcile": Record<string, never>;
};

/** Retry policy per queue. Retries back off exponentially. */
export const QUEUE_OPTIONS: Record<QueueName, QueueOptions> = {
  "document-process": { retryLimit: 2, retryDelay: 15, retryBackoff: true, expireInSeconds: 30 * 60 },
  "storage-delete": { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 5 * 60 },
  "storage-reconcile": { retryLimit: 1, retryDelay: 60, expireInSeconds: 30 * 60 },
};

export type { Job };

const globalForJobs = globalThis as unknown as { studyosBoss?: Promise<PgBoss> };

async function createBoss(role: "sender" | "worker") {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const boss = new PgBoss({
    connectionString,
    max: role === "sender" ? 2 : 4,
    // The schema is installed by `pnpm db:migrate`, never at request time.
    migrate: false,
    createSchema: false,
    // Only the worker runs maintenance and cron schedules.
    supervise: role === "worker",
    schedule: role === "worker",
    registerInstance: role === "worker",
    instanceName: role === "worker" ? "worker" : undefined,
  });
  boss.on("error", (err) => logger.error({ err }, "job queue error"));
  await boss.start();
  for (const name of Object.values(QUEUES)) await boss.createQueue(name, QUEUE_OPTIONS[name]);
  return boss;
}

/** The process's queue client. The first call connects it and makes sure the queues exist. */
export function getBoss(role: "sender" | "worker" = "sender"): Promise<PgBoss> {
  globalForJobs.studyosBoss ??= createBoss(role).catch((error) => {
    globalForJobs.studyosBoss = undefined;
    throw error;
  });
  return globalForJobs.studyosBoss;
}

export async function stopBoss() {
  const boss = await globalForJobs.studyosBoss?.catch(() => undefined);
  globalForJobs.studyosBoss = undefined;
  await boss?.stop({ graceful: true, timeout: 20_000 });
}

/**
 * Enqueues a job inside the caller's transaction (see `withTransaction`), so
 * the job exists if and only if the transaction commits.
 */
export async function enqueue<Q extends QueueName>(
  tx: SqlExecutor,
  queue: Q,
  data: JobPayloads[Q],
  options: Omit<SendOptions, "db"> = {},
) {
  const boss = await getBoss();
  return boss.send(queue, data, { ...options, db: tx as never });
}
