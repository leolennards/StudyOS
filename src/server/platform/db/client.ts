import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction: repositories accept either. */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { studyosPool?: Pool; studyosDb?: Database };

/**
 * One pool per process. In development, hot reload would otherwise open a
 * new pool on every change, so it is cached on globalThis.
 */
export function getDb(): Database {
  if (globalForDb.studyosDb) return globalForDb.studyosDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  const db = drizzle(pool, { schema });
  globalForDb.studyosPool = pool;
  globalForDb.studyosDb = db;
  return db;
}

/** Runs raw SQL on the connection a transaction holds; what the job queue needs to enqueue inside it. */
export type SqlExecutor = { executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> };

/**
 * A transaction that both Drizzle and the job queue can write to, so a job
 * is only ever enqueued together with the rows it refers to (Architecture
 * §33, transactional enqueue). Either everything commits or nothing does.
 */
export async function withTransaction<T>(fn: (tx: Database, sql: SqlExecutor) => Promise<T>): Promise<T> {
  getDb();
  const client = await globalForDb.studyosPool!.connect();
  try {
    await client.query("begin");
    const tx = drizzle(client, { schema }) as unknown as Database;
    const executor: SqlExecutor = { executeSql: (text, values) => client.query(text, values as unknown[]) };
    const result = await fn(tx, executor);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  await globalForDb.studyosPool?.end();
  globalForDb.studyosPool = undefined;
  globalForDb.studyosDb = undefined;
}
