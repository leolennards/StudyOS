import { execFileSync } from "node:child_process";

/**
 * Applies migrations once to the test database before the integration suite.
 * TEST_DATABASE_URL must point at a database that may be reset.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see README: running the tests)");
  process.env.DATABASE_URL = url;
  execFileSync("node", ["--experimental-strip-types", "scripts/migrate.ts"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
