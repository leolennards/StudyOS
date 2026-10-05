import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

const subjectTab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name });

async function addTopic(page: Page, name: string) {
  await page.getByRole("button", { name: "Add a topic" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Add topic" }).click();
  await expect(dialog).toHaveCount(0);
}

test("a student writes cards and reviews them with spaced repetition", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("Content Security Policy")) cspViolations.push(m.text());
  });
  await signUp(page);
  await createSubject(page, "Cell Biology");
  await addTopic(page, "Organelles");

  await subjectTab(page, "Flashcards").click();
  await expect(page.getByRole("heading", { name: "No flashcards yet" })).toBeVisible();
  await page.getByRole("button", { name: "New card" }).click();

  // A basic card, with maths, and a topic. "Add card" keeps the dialog open for the next one.
  const dialog = page.getByRole("dialog", { name: "New card" });
  await dialog.getByLabel("Front").fill("What does ATP synthase make?");
  await dialog.getByLabel("Back").fill("ATP, from $ADP + P_i$");
  await dialog.getByLabel("Organelles").check();
  await expect(dialog.getByRole("region", { name: "Preview" }).locator(".katex")).toBeVisible();
  await dialog.getByRole("button", { name: "Add card" }).click();
  await expect(dialog.getByText("1 card added")).toBeVisible();
  await expect(dialog.getByLabel("Front")).toHaveValue("");

  // A cloze card, made with "Hide selection".
  await dialog.getByRole("radio", { name: "Cloze" }).click();
  const text = dialog.getByLabel("Text");
  await text.fill("The mitochondrion is the powerhouse of the cell.");
  await text.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 17));
  await dialog.getByRole("button", { name: "Hide selection" }).click();
  await expect(text).toHaveValue("The {{c1::mitochondrion}} is the powerhouse of the cell.");
  await expect(dialog.getByRole("region", { name: "Preview" }).locator("[data-cloze=blank]")).toHaveText("[…]");
  await dialog.getByRole("button", { name: "Add and close" }).click();
  await expect(dialog).toHaveCount(0);

  const list = page.getByRole("list", { name: "Flashcards" });
  await expect(list.locator(":scope > li")).toHaveCount(2);
  // Topics stay chosen for the next card added in the same dialog.
  await expect(list.getByText("Organelles")).toHaveCount(2);
  await expect(subjectTab(page, "Flashcards")).toContainText("2");
  await expect(page.getByText("0 cards due, 2 new")).toBeVisible();

  // Review: newest-added order, Space shows the answer, keys 1 to 4 rate.
  await page.getByRole("link", { name: "Review" }).filter({ visible: true }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: "Review" })).toBeVisible();
  const question = page.getByTestId("card-question");
  await expect(question).toContainText("What does ATP synthase make?");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("card-answer").locator(".katex")).toBeVisible();
  const good = page.getByRole("group", { name: "How well did you remember it?" }).getByRole("button", { name: /Good/ });
  await expect(good).toContainText("10m");
  await page.keyboard.press("4");

  await expect(question.locator("[data-cloze=blank]")).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(question.locator("[data-cloze=answer]")).toHaveText("mitochondrion");
  await good.click();

  // Undo puts the last card back.
  await expect(question.locator("[data-cloze=blank]")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(question.locator("[data-cloze=blank]")).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press("4");

  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect(page.getByText("You reviewed 2 cards")).toBeVisible();

  // Both cards are now scheduled days ahead.
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByText("You're up to date")).toBeVisible();
  await expect(list.getByText(/Due in \d+d/)).toHaveCount(2);
  expect(cspViolations).toEqual([]);
});

test("a card can be made from a note selection and found by search", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Physiology");
  await subjectTab(page, "Notes").click();
  await page.getByRole("button", { name: "New note" }).first().click();
  await page.getByRole("textbox", { name: "Title" }).fill("Kidneys");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The nephron filters blood.");
  const editor = page.getByRole("textbox", { name: "Note" });
  await editor.locator("p").first().selectText();
  await page.getByRole("button", { name: "Make a flashcard from the selection" }).click();

  const dialog = page.getByRole("dialog", { name: "New card" });
  await expect(dialog.getByLabel("Front")).toHaveValue("The nephron filters blood.");
  await dialog.getByLabel("Front").fill("What does the nephron filter?");
  await dialog.getByLabel("Back").fill("Blood");
  await dialog.getByRole("button", { name: "Add and close" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.locator("[data-save-state=saved]")).toBeVisible({ timeout: 10_000 });
  await page.goto("/subjects");
  await page
    .getByRole("link", { name: /Physiology/ })
    .first()
    .click();
  await subjectTab(page, "Flashcards").click();
  const card = page.getByRole("list", { name: "Flashcards" }).locator(":scope > li");
  await expect(card.getByRole("link", { name: "Kidneys" })).toBeVisible();

  // Search finds the card and opens it for editing.
  await page.getByRole("button", { name: "Search" }).filter({ visible: true }).first().click();
  const palette = page.getByRole("dialog", { name: "Search" });
  await palette.getByRole("combobox").fill("nephron");
  await palette.getByRole("option", { name: /What does the nephron filter/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit card" });
  await expect(edit.getByLabel("Front")).toHaveValue("What does the nephron filter?");
  await edit.getByLabel("Back").fill("Blood plasma");
  await edit.getByRole("button", { name: "Save card" }).click();
  await expect(edit).toHaveCount(0);
  await expect(card.getByText("Blood plasma")).toBeVisible();
});

test("cards can be suspended, deleted, and review settings changed", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Statistics");
  await subjectTab(page, "Flashcards").click();
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog", { name: "New card" });
  await dialog.getByRole("radio", { name: "Basic and reversed" }).click();
  await dialog.getByLabel("Front").fill("Mean");
  await dialog.getByLabel("Back").fill("Average");
  await dialog.getByRole("button", { name: "Add and close" }).click();

  const card = page.getByRole("list", { name: "Flashcards" }).locator(":scope > li");
  await expect(card).toContainText("Basic and reversed");
  await card.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Suspend" }).click();
  await expect(card.getByText("Suspended")).toBeVisible();
  await expect(page.getByText("Nothing to review yet")).toBeVisible();

  await card.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete card" }).click();
  await expect(page.getByRole("heading", { name: "No flashcards yet" })).toBeVisible();

  await page.goto("/settings");
  const perDay = page.getByLabel("New cards per day");
  await expect(perDay).toHaveValue("20");
  await perDay.fill("5");
  await page.getByRole("button", { name: "Save" }).nth(2).click();
  await expect(page.getByText("Review settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("New cards per day")).toHaveValue("5");
});

test("a card can be made from text selected in a document, linked to its page", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "History");
  const subjectUrl = page.url();
  await subjectTab(page, "Documents").click();
  await page.getByLabel("Choose files to upload").setInputFiles(path.resolve("tests/fixtures/documents/reading.txt"));
  const link = page.getByRole("list", { name: "Documents" }).getByRole("link", { name: "reading" });
  await expect(link).toBeVisible({ timeout: 60_000 });
  await link.click();

  const line = page.getByText("The French Revolution began in 1789.");
  await expect(line).toBeVisible();
  await line.selectText();
  await page.getByRole("button", { name: "Make a flashcard from page 1" }).click();
  const dialog = page.getByRole("dialog", { name: "New card" });
  await expect(dialog.getByLabel("Front")).toHaveValue(/The French Revolution began in 1789\./);
  await dialog.getByLabel("Front").fill("When did the French Revolution begin?");
  await dialog.getByLabel("Back").fill("1789");
  await dialog.getByRole("button", { name: "Add and close" }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto(`${subjectUrl}/flashcards`);
  const source = page.getByRole("list", { name: "Flashcards" }).getByRole("link", { name: /reading, p\. 1/ });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute("href", /\/documents\/.+\?page=1$/);
});
