import { expect, test } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

/** A date `days` from today, as the date input wants it. New accounts use UTC. */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const weekdayIn = (days: number) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.now() + days * 86_400_000),
  );

test("a student plans their week, works through today and replans around a day off", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Biology");
  await page.getByRole("button", { name: "Add a section" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Cells");
  await dialog.getByRole("button", { name: "Add section" }).click();
  for (const name of ["Mitosis", "Meiosis"]) {
    await page.getByRole("button", { name: "Add a topic to Cells" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Add topic" }).click();
    await expect(page.getByText(name)).toBeVisible();
  }
  const main = page.locator("#main");

  await page.goto("/exams");
  await main.getByRole("button", { name: "Add an exam" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Biology final");
  await dialog.getByLabel("Date").fill(inDays(10));
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Biology final" })).toBeVisible();
  const mitosis = main.getByRole("group", { name: "How confident are you about Mitosis?" });
  await mitosis.getByRole("button", { name: "Confident" }).click();
  await expect(mitosis.getByRole("button", { name: "Confident" })).toHaveAttribute("aria-pressed", "true");

  // Today offers a plan; the plan page asks when the student can study.
  await page.goto("/today");
  await main.getByRole("link", { name: "Make a plan" }).click();
  await expect(main.getByRole("heading", { level: 2, name: "When can you study?" })).toBeVisible();
  for (let i = 0; i < 7; i++) await main.getByLabel(`Minutes on ${weekdayIn(i)}`).fill("60");
  await expect(main.getByText("7 h a week.")).toBeVisible();
  await main.getByRole("button", { name: "Plan my week" }).click();

  // The weaker topic comes first.
  const today = main.getByRole("list", { name: "Plan for Today" });
  await expect(today.getByRole("listitem")).toHaveCount(2);
  await expect(today.getByRole("listitem").first()).toContainText("Meiosis");
  await expect(today.getByRole("listitem").first()).toContainText("Biology · for Biology final on");
  await expect(today.getByRole("listitem").nth(1)).toContainText("Mitosis");

  await today.getByRole("checkbox", { name: "Done: Meiosis" }).click();
  await expect(today.getByRole("checkbox", { name: "Done: Meiosis" })).toHaveAttribute("aria-checked", "true");
  await expect(main.getByText("30 min of 1 h done")).toBeVisible();

  await today.getByRole("button", { name: "More for Mitosis" }).click();
  await page.getByRole("menuitem", { name: "Tomorrow" }).click();
  await expect(today.getByRole("listitem")).toHaveCount(1);
  await expect(main.getByRole("list", { name: "Plan for Tomorrow" })).toContainText("Mitosis");

  // Today's part of the plan is on the Today page too.
  await page.goto("/today");
  const card = main.getByRole("list", { name: "Today's plan" });
  await expect(card.getByRole("checkbox", { name: "Done: Meiosis" })).toHaveAttribute("aria-checked", "true");
  await expect(main.getByText("All done for today.")).toBeVisible();

  // Take tomorrow off: the plan is made again around it, and what is done stays.
  await page.goto("/plan");
  await main.getByRole("button", { name: "Study time" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(`Minutes on ${weekdayIn(1)}`).fill("0");
  await dialog.getByRole("button", { name: "Save and replan" }).click();
  await expect(dialog).toBeHidden();
  await expect(main.getByRole("region", { name: "Tomorrow" })).toContainText("A day off.");
  await expect(today.getByRole("checkbox", { name: "Done: Meiosis" })).toHaveAttribute("aria-checked", "true");
  await expect(today.getByRole("listitem")).toHaveCount(2);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the plan page should not scroll sideways").toBeLessThanOrEqual(1);
});
