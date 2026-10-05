/**
 * Applies pending SQL migrations. Run as a release step before the new
 * web and worker processes start: `pnpm db:migrate`. On Vercel it runs in
 * the production build (vercel.json), so a failed migration fails the
 * deploy and the previous version stays live.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";

async function main() {
  // Schema changes go over a direct connection when one is given; a pooled
  // one (Neon's "-pooler" address) is for the app's short queries.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "src/server/platform/db/migrations" });
    // The job queue keeps its tables in its own `pgboss` schema and upgrades
    // them itself; doing it here keeps DDL out of the running processes.
    const boss = new PgBoss({
      connectionString: url,
      max: 1,
      supervise: false,
      schedule: false,
      registerInstance: false,
    });
    await boss.start();
    await boss.stop({ graceful: false });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
