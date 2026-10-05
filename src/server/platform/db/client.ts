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

export async function closeDb() {
  await globalForDb.studyosPool?.end();
  globalForDb.studyosPool = undefined;
  globalForDb.studyosDb = undefined;
}
