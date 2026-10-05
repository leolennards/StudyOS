import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside a React Server Components build; in tests
    // the server code runs in plain Node, as it does in the worker.
    alias: { "server-only": new URL("./tests/helpers/empty-module.ts", import.meta.url).pathname },
  },
  test: {
    environment: "node",
    projects: [
      {
        // Pure domain logic and schemas: no database, fast.
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"] },
      },
      {
        // Services, repositories and the tenant-isolation suite: real Postgres.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/helpers/global-setup.ts"],
          setupFiles: ["tests/helpers/setup-env.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
