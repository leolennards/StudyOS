import { expect, test } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

/** A date `days` from today, as the date input wants it. New accounts use UTC. */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test("an exam gets a countdown, a topic checklist and a place on Today", async ({ page }) => {
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
  await expect(main.getByRole("heading", { name: "No exams yet" })).toBeVisible();
  await main.getByRole("button", { name: "Add an exam" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Biology final");
  // The only subject is chosen already.
  await expect(dialog.getByLabel("Subject")).toHaveValue(/.+/);
  await dialog.getByLabel("Date").fill(inDays(20));
  await dialog.getByLabel("Starts at").fill("09:30");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Biology final" })).toBeVisible();
  await expect(main.getByText("20", { exact: true })).toBeVisible();
  await expect(main.getByText("days to go")).toBeVisible();
  await expect(main.getByText("2 topics to rate")).toBeVisible();

  // Rating a topic updates readiness straight away.
  const mitosis = main.getByRole("group", { name: "How confident are you about Mitosis?" });
  await mitosis.getByRole("button", { name: "Confident" }).click();
  await expect(mitosis.getByRole("button", { name: "Confident" })).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByText("1 of 2 topics confident")).toBeVisible();
  await expect(main.getByText("50%")).toBeVisible();

  // Leave a topic out of the exam.
  await main.getByRole("button", { name: "Choose topics" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Only some topics").check();
  await dialog.getByLabel("Mitosis").uncheck();
  await dialog.getByRole("button", { name: "Save topics" }).click();
  await expect(main.getByText("1 topic picked", { exact: false })).toBeVisible();
  await expect(main.getByRole("group", { name: "How confident are you about Mitosis?" })).toHaveCount(0);
  await expect(main.getByText("1 topic to rate")).toBeVisible();
  await main
    .getByRole("group", { name: "How confident are you about Meiosis?" })
    .getByRole("button", { name: "Not yet" })
    .click();
  await expect(main.getByText("0 of 1 topic confident")).toBeVisible();

  // Today counts down to it and says what to work on.
  await page.goto("/today");
  await expect(main.getByRole("heading", { level: 2, name: "Next exam" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Biology final" })).toBeVisible();
  await expect(main.getByText("Work on these first")).toBeVisible();
  await expect(main.getByRole("link", { name: /Meiosis\s*Not yet/ })).toBeVisible();

  // Focus picks the exam's subject.
  await main.getByRole("link", { name: "Focus", exact: true }).click();
  await expect(page).toHaveURL(/\/focus\?subject=/);
  await expect(page.getByLabel("What are you studying?")).toHaveValue(/.+/);
  await expect(page.getByLabel("What are you studying?").locator("option:checked")).toHaveText("Biology");

  // Edit, then delete.
  await page.goto("/exams");
  await main.getByRole("link", { name: /Biology final/ }).click();
  await main.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Biology paper 1");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Biology paper 1" })).toBeVisible();

  await main.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/exams$/);
  await expect(main.getByRole("heading", { name: "No exams yet" })).toBeVisible();
});

test("an exam date that's years away is refused", async ({ page }) => {
  await signUp(page);
  await page.goto("/exams?new=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Far off");
  await dialog.getByLabel("Date").fill(inDays(5 * 365));
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText("That's more than three years away")).toBeVisible();
});
