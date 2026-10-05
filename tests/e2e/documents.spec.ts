import path from "node:path";
import { expect, test } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

const fixtures = path.resolve("tests/fixtures/documents");

test("a student can upload a lecture, read its text, link a topic and delete it", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Cell Biology");

  // A topic to link the document to later.
  await page.getByRole("button", { name: "Add a topic" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Cell structure");
  await dialog.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByText("Cell structure")).toBeVisible();

  await page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name: "Documents" }).click();
  await expect(page).toHaveURL(/\/documents$/);

  // Upload goes straight to storage, then the worker extracts the text.
  await page.getByLabel("Choose files to upload").setInputFiles(path.join(fixtures, "lecture.pdf"));
  const documents = page.getByRole("list", { name: "Documents" });
  const link = documents.getByRole("link", { name: "lecture" });
  await expect(link).toBeVisible({ timeout: 60_000 });
  await expect(documents.getByText("2 pages")).toBeVisible();

  // The viewer shows the original and the text StudyOS read from it.
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name: "lecture" })).toBeVisible();
  await expect(page.locator("#viewer-original canvas").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Extracted text" }).click();
  await expect(page.getByText("The cell is the basic unit of life")).toBeVisible();
  await expect(page.getByText("Mitochondria release energy")).toBeVisible();

  // Link it to the topic, from the list.
  await page.goBack();
  await page.getByRole("button", { name: "More actions for lecture" }).click();
  await page.getByRole("menuitem", { name: "Link topics" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cell structure").check();
  await dialog.getByRole("button", { name: "Save topics" }).click();
  await expect(documents.getByRole("list", { name: "Topics" }).getByText("Cell structure")).toBeVisible();

  // It survives a reload, then it can be deleted.
  await page.reload();
  await expect(documents.getByRole("link", { name: "lecture" })).toBeVisible();
  await page.getByRole("button", { name: "More actions for lecture" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete document" }).click();
  await expect(documents).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
});

test("an unsupported file is refused before it is uploaded", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "History");
  await page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name: "Documents" }).click();

  await page.getByLabel("Choose files to upload").setInputFiles({
    name: "old-notes.doc",
    mimeType: "application/msword",
    buffer: Buffer.from("legacy"),
  });
  await expect(page.getByRole("list", { name: "Uploads" }).getByRole("alert")).toBeVisible();
});
