import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

const diagram = path.join(__dirname, "../fixtures/images/heart-diagram.png");

/** Picks a picture through the file chooser the "Add picture" button opens. */
async function choosePicture(page: Page, button: Locator) {
  const chooser = page.waitForEvent("filechooser");
  await button.click();
  await (await chooser).setFiles(diagram);
}

/** Drags across a fraction of an element, as a student draws a box. */
async function drag(page: Page, target: Locator, from: [number, number], to: [number, number]) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((from[0] + to[0]) / 2), box.y + box.height * ((from[1] + to[1]) / 2));
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1]);
  await page.mouse.up();
}

test("a student hides the labels on a diagram and reviews it one box at a time", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("Content Security Policy")) cspViolations.push(m.text());
  });
  await signUp(page);
  await createSubject(page, "Anatomy");
  await page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name: "Flashcards" }).click();
  await page.getByRole("button", { name: "New card" }).click();

  const dialog = page.getByRole("dialog", { name: "New card" });
  await dialog.getByRole("radio", { name: "Image occlusion" }).click();
  await dialog.getByLabel("Prompt (optional)").fill("Name the labelled part of the heart.");
  await choosePicture(page, dialog.getByRole("button", { name: "Choose a picture (picture to hide parts of)" }));

  const editor = dialog.getByRole("application", { name: /Drag to draw a box/ });
  await expect(editor.locator("img")).toHaveJSProperty("complete", true);
  await expect.poll(() => editor.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);
  await drag(page, editor, [0.03, 0.18], [0.2, 0.28]);
  await drag(page, editor, [0.81, 0.72], [0.97, 0.82]);
  await expect(dialog.getByRole("list", { name: "Boxes" }).getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByText("This card will be asked 2 ways.")).toBeVisible();

  // A box can be removed and drawn again; the new one gets a new number.
  await dialog.getByRole("button", { name: "Remove box 2" }).click();
  await expect(dialog.getByText("This card will be asked 1 way.")).toBeVisible();
  await drag(page, editor, [0.81, 0.72], [0.97, 0.82]);
  await expect(dialog.getByRole("button", { name: "Remove box 3" })).toBeVisible();
  await dialog.getByRole("button", { name: "Add and close" }).click();
  await expect(dialog).toHaveCount(0);

  const list = page.getByRole("list", { name: "Flashcards" });
  await expect(list).toContainText("Name the labelled part of the heart.");
  await expect(list).toContainText("Image occlusion (2)");

  // Review: the asked box is marked, the others stay covered; showing the answer uncovers it.
  await page.getByRole("link", { name: "Review" }).filter({ visible: true }).last().click();
  const picture = page.getByTestId("occlusion-picture");
  await expect(picture.locator("[data-state=asked]")).toHaveCount(1);
  await expect(picture.locator("[data-state=covered]")).toHaveCount(1);
  await expect.poll(() => picture.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);
  await page.keyboard.press("Space");
  await expect(picture.locator("[data-state=uncovered]")).toHaveCount(1);
  await expect(picture.locator("[data-state=covered]")).toHaveCount(1);
  await page
    .getByRole("group", { name: "How well did you remember it?" })
    .getByRole("button", { name: /Good/ })
    .click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the review page should not scroll sideways").toBeLessThanOrEqual(1);
  expect(cspViolations).toEqual([]);
});

test("a picture can go on either side of a basic card", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Geography");
  await page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name: "Flashcards" }).click();
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog", { name: "New card" });
  await choosePicture(page, dialog.getByRole("button", { name: "Add picture (picture on the front)" }));
  await expect(dialog.getByRole("img", { name: "Picture on the front" })).toBeVisible();
  await dialog.getByLabel("Back").fill("A heart, seen from the front");
  await expect(dialog.getByRole("region", { name: "Preview" }).getByRole("img")).toBeVisible();
  await dialog.getByRole("button", { name: "Add and close" }).click();
  await expect(dialog).toHaveCount(0);

  const list = page.getByRole("list", { name: "Flashcards" });
  await expect(list).toContainText("Picture");
  await expect(list).toContainText("A heart, seen from the front");

  await page.getByRole("link", { name: "Review" }).filter({ visible: true }).last().click();
  const question = page.getByTestId("card-question").getByRole("img", { name: "Picture on the question" });
  await expect(question).toBeVisible();
  await expect.poll(() => question.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("card-answer")).toContainText("A heart, seen from the front");
});
