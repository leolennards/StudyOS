import { expect, test } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

test("a student can build a subject's structure and see it persist", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Organic Chemistry");

  // A section, then a topic inside it.
  await page.getByRole("button", { name: "Add a section" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Reaction mechanisms");
  await dialog.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("heading", { name: "Reaction mechanisms" })).toBeVisible();

  await page.getByRole("button", { name: "Add a topic to Reaction mechanisms" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Nucleophilic substitution");
  await dialog.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByText("Nucleophilic substitution")).toBeVisible();

  // It survives a reload, so it really is stored.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Reaction mechanisms" })).toBeVisible();
  await expect(page.getByText("Nucleophilic substitution")).toBeVisible();
  await expect(page.getByText("1 section, 1 topic")).toBeVisible();
});

test("sections can be reordered and nested two levels deep", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Physics");

  await page.getByRole("button", { name: "Add a section" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Mechanics");
  await dialog.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("heading", { name: "Mechanics" })).toBeVisible();

  await page.getByRole("button", { name: "Section" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Optics");
  await dialog.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("heading", { name: "Optics" })).toBeVisible();

  const titles = () => page.getByTestId("section").locator("h3").allInnerTexts();
  expect(await titles()).toEqual(["Mechanics", "Optics"]);

  await page.getByRole("button", { name: "More actions for Optics" }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect.poll(titles).toEqual(["Optics", "Mechanics"]);

  // A sub-section is allowed; a third level is not offered.
  await page.getByRole("button", { name: "More actions for Optics" }).click();
  await page.getByRole("menuitem", { name: "Add section inside" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Refraction");
  await dialog.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("heading", { name: "Refraction" })).toBeVisible();

  await page.getByRole("button", { name: "More actions for Refraction" }).click();
  await expect(page.getByRole("menuitem", { name: "Add section inside" })).toHaveCount(0);
});

test("deleting a section keeps its topics", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Biology");

  await page.getByRole("button", { name: "Add a section" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Cells");
  await dialog.getByRole("button", { name: "Add section" }).click();

  await page.getByRole("button", { name: "Add a topic to Cells" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Mitosis");
  await dialog.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByText("Mitosis")).toBeVisible();

  await page.getByRole("button", { name: "More actions for Cells" }).click();
  await page.getByRole("menuitem", { name: "Delete section" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("will be kept");
  await confirm.getByRole("button", { name: "Delete section" }).click();

  await expect(page.getByRole("heading", { name: "Cells" })).toHaveCount(0);
  await expect(page.getByText("Topics without a section")).toBeVisible();
  await expect(page.getByText("Mitosis")).toBeVisible();
});

test("a subject can be archived, restored and deleted by name", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Statistics");

  await page.getByRole("button", { name: "More subject actions" }).click();
  await page.getByRole("menuitem", { name: "Archive subject" }).click();
  await expect(page.getByText("This subject is archived.")).toBeVisible();

  await page.goto("/subjects");
  await expect(page.getByText("Add your first subject")).toBeVisible();
  await page.getByRole("link", { name: "Archived" }).click();
  await page.getByRole("link", { name: /Statistics/ }).click();

  await page.getByRole("button", { name: "More subject actions" }).click();
  await page.getByRole("menuitem", { name: "Restore subject" }).click();
  await expect(page.getByText("This subject is archived.")).toHaveCount(0);

  await page.getByRole("button", { name: "More subject actions" }).click();
  await page.getByRole("menuitem", { name: "Delete subject" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("button", { name: "Delete subject" })).toBeDisabled();
  await confirm.getByRole("textbox").fill("Statistics");
  await confirm.getByRole("button", { name: "Delete subject" }).click();

  await expect(page).toHaveURL(/\/subjects$/);
  await expect(page.getByText("Add your first subject")).toBeVisible();
});

test("an unknown subject id shows the not-found page, not an error", async ({ page }) => {
  await signUp(page);
  await page.goto("/subjects/01927f1a-0000-7000-8000-000000000000");
  await expect(page.getByText("We couldn't find that subject")).toBeVisible();
});
