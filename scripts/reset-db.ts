/**
 * Drops and recreates the public schema, then re-applies migrations.
 * Development and test only: it deletes all data.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("drop schema public cascade; create schema public");
  } finally {
    await pool.end();
  }
  execFileSync("pnpm", ["db:migrate"], { stdio: "inherit" });
  console.log("Database reset.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
