import { expect, test } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

test("a student enters a paper's questions, logs an attempt and sees where the marks went", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Physics");
  await page.getByRole("button", { name: "Add a section" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Energy");
  await dialog.getByRole("button", { name: "Add section" }).click();
  for (const name of ["Thermodynamics", "Waves"]) {
    await page.getByRole("button", { name: "Add a topic to Energy" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Add topic" }).click();
    await expect(page.getByText(name)).toBeVisible();
  }
  const main = page.locator("#main");

  await main.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name: "Past papers" }).click();
  await expect(main.getByRole("heading", { name: "No past papers yet" })).toBeVisible();
  await main.getByRole("button", { name: "Add a past paper" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("June 2023 Paper 1");
  await dialog.getByLabel("Year").fill("2023");
  await dialog.getByLabel("Minutes").fill("90");
  await dialog.getByRole("button", { name: "Add paper" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "June 2023 Paper 1" })).toBeVisible();
  await expect(main.getByText("2023 · 90 min")).toBeVisible();

  // Enter two questions; the second is numbered for us.
  await main.getByRole("button", { name: "Enter questions" }).click();
  await main.getByLabel("Marks for question 1").fill("6");
  await main.getByRole("button", { name: "Topics for question 1" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Thermodynamics").check();
  await dialog.getByRole("button", { name: "Done" }).click();
  await main.getByRole("button", { name: "Add a question" }).click();
  await expect(main.getByLabel("Question 2 number")).toHaveValue("2");
  await main.getByLabel("Marks for question 2").fill("4");
  await main.getByRole("button", { name: "Topics for question 2" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Waves").check();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(main.getByText("2 questions, 10 marks")).toBeVisible();
  await main.getByRole("button", { name: "Save questions" }).click();
  await expect(main.getByRole("row", { name: /^1 Thermodynamics 6/ })).toBeVisible();
  await expect(main.getByRole("row", { name: /^2 Waves 4/ })).toBeVisible();

  // Log a sitting, mark by mark.
  await main.getByRole("button", { name: "Log an attempt" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Question 1").fill("2");
  await dialog.getByLabel("Question 2").fill("5");
  await dialog.getByRole("button", { name: "Save attempt" }).click();
  await expect(dialog.getByText("Out of 4")).toBeVisible();
  await dialog.getByLabel("Question 2").fill("4");
  await expect(dialog.getByText("Total: 6 out of 10 (60%)")).toBeVisible();
  await dialog.getByRole("button", { name: "Save attempt" }).click();
  await expect(dialog).toBeHidden();

  const attempts = main.getByRole("list", { name: "Attempts" });
  await expect(attempts.getByRole("listitem")).toHaveCount(1);
  await expect(attempts).toContainText("6 / 10");
  await expect(main.getByText("Latest 60%.")).toBeVisible();

  // The subject's tab shows the score and which topic cost the marks.
  await page.getByRole("link", { name: "Physics past papers" }).click();
  const papers = main.getByRole("list", { name: "Past papers" });
  await expect(papers).toContainText("June 2023 Paper 1");
  await expect(papers).toContainText("60%");
  const topics = main.getByRole("list", { name: "Topics by marks" });
  await expect(topics.getByRole("listitem").first()).toContainText("Thermodynamics");
  await expect(topics.getByRole("listitem").first()).toContainText("60% of marks · in 1 of 1 · you got 33%");
  await expect(main.getByText("Thermodynamics (you lost 40% of all marks here)")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the past papers page should not scroll sideways").toBeLessThanOrEqual(1);
});

test("a paper without its questions takes a score, shows the trend, and can be deleted", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Chemistry");
  const main = page.locator("#main");
  await page.goto(`${page.url()}/papers`);

  await main.getByRole("button", { name: "Add a past paper" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Specimen paper");
  await dialog.getByLabel("Total marks").fill("80");
  await dialog.getByRole("button", { name: "Add paper" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Specimen paper" })).toBeVisible();

  for (const [date, score] of [
    ["2026-01-10", "40"],
    ["2026-02-10", "52"],
  ]) {
    await main.getByRole("button", { name: "Log an attempt" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Out of")).toHaveValue("80");
    await dialog.getByLabel("Date").fill(date);
    await dialog.getByLabel("Score").fill(score);
    await dialog.getByRole("button", { name: "Save attempt" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(main.getByText("Latest 65%.")).toBeVisible();

  await page.getByRole("link", { name: "Chemistry past papers" }).click();
  const papers = main.getByRole("list", { name: "Past papers" });
  await expect(papers.getByLabel("Up on last time")).toBeVisible();
  await expect(papers).toContainText("sat 2 times");

  // Take the latest attempt back, then the paper.
  await papers.getByRole("link", { name: "Specimen paper" }).click();
  await main.getByRole("button", { name: "Delete the attempt on 10 Feb 2026" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete attempt" }).click();
  await expect(main.getByRole("list", { name: "Attempts" }).getByRole("listitem")).toHaveCount(1);
  await expect(main.getByText("Latest 50%.")).toBeVisible();

  await main.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("your attempt at it");
  await confirm.getByRole("button", { name: "Delete paper" }).click();
  await expect(main.getByRole("heading", { name: "No past papers yet" })).toBeVisible();
});
