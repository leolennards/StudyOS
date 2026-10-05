import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

const fixtures = path.resolve("tests/fixtures/documents");

const subjectTab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name });

/** Creates a note from the subject's Notes tab and waits for the editor. */
async function newNote(page: Page) {
  await subjectTab(page, "Notes").click();
  await page.getByRole("button", { name: "New note" }).first().click();
  await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
}

const saved = (page: Page) => expect(page.locator("[data-save-state=saved]")).toBeVisible({ timeout: 10_000 });

async function openSearch(page: Page) {
  await page.getByRole("button", { name: "Search" }).filter({ visible: true }).first().click();
  const palette = page.getByRole("dialog", { name: "Search" });
  await expect(palette).toBeVisible();
  return palette;
}

test("a student can write a note with formatting and maths, and it is saved", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Plant Biology");
  await page.getByRole("button", { name: "Add a topic" }).first().click();
  const topicDialog = page.getByRole("dialog");
  await topicDialog.getByLabel("Name").fill("Photosynthesis");
  await topicDialog.getByRole("button", { name: "Add topic" }).click();

  await subjectTab(page, "Notes").click();
  await expect(page.getByRole("heading", { name: "No notes yet" })).toBeVisible();
  await newNote(page);

  await page.getByRole("textbox", { name: "Title" }).fill("Light reactions");
  await page.keyboard.press("Enter");
  const editor = page.getByRole("textbox", { name: "Note" });
  await page.keyboard.type("Chlorophyll absorbs red and blue light.");

  // The "/" menu inserts blocks.
  await page.keyboard.press("Enter");
  await page.keyboard.type("/bullet");
  await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Happens in the thylakoids");
  await expect(editor.locator("ul li")).toHaveText("Happens in the thylakoids");

  // Maths is written in LaTeX with a live preview.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Equation" }).click();
  const mathDialog = page.getByRole("dialog");
  await mathDialog.getByLabel("LaTeX").fill("6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6");
  await expect(mathDialog.getByLabel("Preview").locator(".katex")).toBeVisible();
  await mathDialog.getByRole("button", { name: "Insert" }).click();
  await expect(editor.locator("[data-type=block-math] .katex")).toBeVisible();
  // Typing carries on below the equation rather than replacing it.
  await page.keyboard.type("Light-dependent");
  await expect(editor.locator("[data-type=block-math] .katex")).toBeVisible();
  await expect(editor.locator("[data-type=block-math] + p")).toHaveText("Light-dependent");

  // Bold from the toolbar, on selected text.
  await editor.locator("p").first().selectText();
  await page.getByRole("button", { name: "Bold" }).click();
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(editor.locator("p strong").first()).toHaveText("Chlorophyll absorbs red and blue light.");

  await saved(page);

  // Link a topic.
  await page.getByRole("button", { name: "Link topics" }).click();
  const topicsDialog = page.getByRole("dialog");
  await topicsDialog.getByLabel("Photosynthesis").check();
  await topicsDialog.getByRole("button", { name: "Save topics" }).click();
  await expect(page.getByRole("list", { name: "Topics" }).getByText("Photosynthesis")).toBeVisible();

  // Everything is still there after a reload.
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Light reactions");
  await expect(editor.locator("p strong").first()).toHaveText("Chlorophyll absorbs red and blue light.");
  await expect(editor.locator("ul li")).toHaveText("Happens in the thylakoids");
  await expect(editor.locator("[data-type=block-math] .katex")).toBeVisible();

  // The list shows it with its excerpt and topic.
  await page.getByRole("main").getByRole("link", { name: "Plant Biology" }).click();
  const notes = page.getByRole("list", { name: "Notes" });
  await expect(notes.getByRole("link", { name: "Light reactions" })).toBeVisible();
  await expect(notes.getByText("Chlorophyll absorbs red and blue light.")).toBeVisible();
  await expect(notes.getByText("Photosynthesis")).toBeVisible();
  await expect(subjectTab(page, "Notes")).toContainText("1");
});

test("notes go to the trash with undo, and can be restored or deleted for good", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Economics");
  await newNote(page);
  await page.getByRole("textbox", { name: "Title" }).fill("Supply and demand");
  await saved(page);

  await page.getByRole("button", { name: "More actions for Supply and demand" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { name: "No notes yet" })).toBeVisible();

  // Undo from the toast brings it straight back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Supply and demand");

  await page.getByRole("button", { name: "More actions for Supply and demand" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await page.getByRole("link", { name: /Trash/ }).click();
  const trash = page.getByRole("list", { name: "Trash" });
  await expect(trash.getByText("Supply and demand")).toBeVisible();

  await trash.getByRole("button", { name: "Restore Supply and demand" }).click();
  await expect(page.getByRole("heading", { name: "The trash is empty" })).toBeVisible();
  await page.getByRole("link", { name: "Back to notes" }).click();
  await expect(page.getByRole("list", { name: "Notes" }).getByText("Supply and demand")).toBeVisible();

  await page.getByRole("button", { name: "More actions for Supply and demand" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await page.getByRole("link", { name: /Trash/ }).click();
  await page.getByRole("button", { name: "Delete Supply and demand for good" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete for good" }).click();
  await expect(page.getByRole("heading", { name: "The trash is empty" })).toBeVisible();
});

test("a save from an older copy of a note is refused, not silently overwritten", async ({ page, context }) => {
  await signUp(page);
  await createSubject(page, "Statistics");
  await newNote(page);
  const url = page.url();

  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByRole("textbox", { name: "Note" })).toBeVisible();

  await page.getByRole("textbox", { name: "Title" }).fill("Saved first");
  await saved(page);

  await other.getByRole("textbox", { name: "Title" }).fill("Saved second");
  await expect(other.getByRole("alert").filter({ hasText: "changed somewhere else" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Saved first");
});

test("search finds notes, topics and the text inside documents", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "European History");

  await page.getByRole("button", { name: "Add a topic" }).first().click();
  const topicDialog = page.getByRole("dialog");
  await topicDialog.getByLabel("Name").fill("Causes of the Revolution");
  await topicDialog.getByRole("button", { name: "Add topic" }).click();

  // A document whose text mentions Versailles.
  await subjectTab(page, "Documents").click();
  await page.getByLabel("Choose files to upload").setInputFiles(path.join(fixtures, "reading.txt"));
  await expect(page.getByRole("list", { name: "Documents" }).getByRole("link", { name: "reading" })).toBeVisible({
    timeout: 60_000,
  });

  // A note about the Estates-General.
  await newNote(page);
  await page.getByRole("textbox", { name: "Title" }).fill("1789");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The Estates-General was summoned by Louis XVI.");
  await saved(page);

  // Notes, as you type.
  let palette = await openSearch(page);
  await palette.getByRole("combobox").fill("summon");
  const noteResult = palette.getByRole("option", { name: /1789/ });
  await expect(noteResult).toBeVisible();
  await expect(noteResult.locator("mark")).toHaveText("summoned");

  // Topics.
  await palette.getByRole("combobox").fill("causes");
  await expect(palette.getByRole("option", { name: /Causes of the Revolution/ })).toBeVisible();

  // Text inside a document, opening at the page it was found on.
  await palette.getByRole("combobox").fill("versailles");
  const pageResult = palette.getByRole("option", { name: /reading.*Page 1/ });
  await expect(pageResult).toBeVisible();
  await pageResult.click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+\?page=1$/);
  await expect(page.getByRole("heading", { level: 1, name: "reading" })).toBeVisible();

  // Nothing found is said plainly.
  palette = await openSearch(page);
  await palette.getByRole("combobox").fill("photosynthesis");
  await expect(palette.getByText(/Nothing matches/)).toBeVisible();

  // ⌘K / Ctrl+K opens and closes it from anywhere.
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
});
