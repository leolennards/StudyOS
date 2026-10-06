import { expect, test } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

test("a focus session counts towards the daily goal and starts a streak", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("Content Security Policy")) cspViolations.push(m.text());
  });
  // The browser's clock starts half an hour behind, so fast-forwarding through a
  // 25-minute block ends it at about the server's real time.
  await page.clock.install({ time: new Date(Date.now() - 30 * 60_000) });
  await signUp(page);
  await createSubject(page, "Organic Chemistry");
  const main = page.locator("#main");

  await page.goto("/today");
  await expect(main.getByRole("heading", { level: 2, name: "Today's goal" })).toBeVisible();
  await expect(main.getByText("Nothing yet today")).toBeVisible();

  await page.goto("/progress");
  await expect(main.getByRole("heading", { name: "Your progress will show here" })).toBeVisible();

  await page.goto("/focus");
  await page.getByLabel("What are you studying?").selectOption({ label: "Organic Chemistry" });
  await page.getByRole("button", { name: /25 min/ }).click();
  await page.getByRole("button", { name: "Start focusing" }).click();
  await expect(page.getByRole("timer")).toHaveText(/2[45]:\d\d/);

  // Pausing stops the clock.
  await page.getByRole("button", { name: "Pause" }).click();
  const paused = await page.getByRole("timer").textContent();
  await page.clock.fastForward("02:00");
  await expect(page.getByRole("timer")).toHaveText(paused!);
  await page.getByRole("button", { name: "Resume" }).click();

  // The block ends by itself, is saved, and the break begins.
  await page.clock.fastForward("25:30");
  await expect(page.getByText(/Focus block done/)).toBeVisible();
  await expect(page.getByText("Break", { exact: true })).toBeVisible();
  await expect(main.getByText("1 focus session, 25 min.")).toBeVisible();
  await page.getByRole("button", { name: "Skip break" }).click();
  await expect(page.getByRole("button", { name: "Start focusing" })).toBeVisible();

  await page.goto("/today");
  await expect(main.getByText("5 min to go")).toBeVisible();
  await expect(main.getByText("1 day", { exact: true })).toBeVisible();

  await page.goto("/progress");
  await expect(main.getByRole("heading", { level: 2, name: "Study calendar" })).toBeVisible();
  await expect(main.getByText("Organic Chemistry", { exact: true })).toBeVisible();
  await expect(main.getByText("25 min").first()).toBeVisible();
  expect(cspViolations).toEqual([]);
});

test("the daily goal can be changed in settings", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings");
  const field = page.getByLabel("Minutes per day");
  await expect(field).toHaveValue("30");
  await page.getByRole("button", { name: "1 h", exact: true }).click();
  await expect(field).toHaveValue("60");
  // Profile, preferences, then the daily goal.
  await page.getByRole("button", { name: "Save" }).nth(2).click();
  await expect(page.getByText("Daily goal saved")).toBeVisible();

  await page.goto("/today");
  await expect(page.getByText("of 60 min")).toBeVisible();
});
