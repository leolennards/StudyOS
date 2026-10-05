import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Use the Chromium already installed in the environment when its build does
 * not match this Playwright version's expected download.
 */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(PREINSTALLED_CHROMIUM) ? { executablePath: PREINSTALLED_CHROMIUM } : {};

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * End-to-end tests run against a real production build with a real database
 * (E2E_DATABASE_URL), so they exercise what a student actually gets.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: "e2e-secret-at-least-32-characters-long",
      BETTER_AUTH_URL: baseURL,
      // No email provider in tests, so nothing is sent and sign-up needs no
      // verification link (see src/server/lib/env.ts).
      EMAIL_TRANSPORT: "log",
      AUTH_RATE_LIMIT: "off",
      LOG_LEVEL: "warn",
      PORT: String(PORT),
    },
  },
});
