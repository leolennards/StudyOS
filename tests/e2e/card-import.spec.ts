import { expect, test } from "@playwright/test";
import { ankiPackage } from "../helpers/anki-package";
import { createSubject, signUp } from "./helpers";

const deck = () =>
  ankiPackage({ 10: "French::Animals", 11: "French::Food" }, [
    {
      id: 1,
      fields: ["chien", "<b>dog</b>"],
      cards: [
        { did: 10, ord: 0 },
        { did: 10, ord: 1 },
      ],
    },
    {
      id: 2,
      fields: ["chat", "cat"],
      cards: [
        { did: 10, ord: 0 },
        { did: 10, ord: 1 },
      ],
    },
    { id: 3, fields: ["le {{c1::pain}} est frais", "bread"], cards: [{ did: 11, ord: 0 }] },
    { id: 4, fields: ['<img src="cheese.jpg">', "fromage"], cards: [{ did: 11, ord: 0 }] },
  ]);

test("a student imports an Anki deck, picks its decks, then takes the import back", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "French");
  await page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name: "Flashcards" }).click();
  await page.getByRole("link", { name: "Import cards" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Import flashcards" })).toBeVisible();

  await page.getByLabel("Choose a file to import").setInputFiles({
    name: "French.apkg",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(await deck()),
  });
  await expect(page.getByRole("heading", { level: 2, name: "Check the cards" })).toBeVisible();
  await expect(page.getByText("3 cards ready to import")).toBeVisible();
  await expect(page.getByText("1 note only had pictures or sound, so it was left out.")).toBeVisible();
  const preview = page.getByRole("list", { name: "Cards to import" });
  await expect(preview.getByRole("listitem")).toHaveCount(3);
  await expect(preview).toContainText("le pain est frais");

  // Only the animals.
  await page.getByRole("group", { name: "Decks" }).getByLabel("French::Food").uncheck();
  await expect(page.getByText("2 cards ready to import")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 cards" }).click();
  await expect(page.getByRole("heading", { name: "Added 2 cards to French" })).toBeVisible();

  await page.getByRole("link", { name: "See the cards" }).click();
  const cards = page.getByRole("list", { name: "Flashcards" });
  await expect(cards.getByRole("listitem")).toHaveCount(2);
  await expect(cards).toContainText("chien");
  await expect(cards).toContainText("Basic and reversed");

  // Importing the same deck again adds only what's new.
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await page.getByLabel("Choose a file to import").setInputFiles({
    name: "French.apkg",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(await deck()),
  });
  await page.getByRole("button", { name: "Import 3 cards" }).click();
  await expect(page.getByRole("heading", { name: "Added 1 card to French" })).toBeVisible();
  await expect(page.getByText("2 cards were already there.")).toBeVisible();

  // Take the first import back.
  await page.getByRole("button", { name: "Import more" }).click();
  const earlier = page.getByRole("list", { name: "Earlier imports" });
  await expect(earlier.getByRole("listitem")).toHaveCount(2);
  await earlier.getByRole("button", { name: "Delete the cards from French.apkg" }).last().click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Delete the 2 cards from French.apkg?");
  await confirm.getByRole("button", { name: "Delete 2 cards" }).click();
  await expect(earlier.getByRole("listitem")).toHaveCount(1);

  await page.getByRole("main").getByRole("link", { name: "French" }).click();
  await expect(cards.getByRole("listitem")).toHaveCount(1);
  await expect(cards).toContainText("le pain est frais");
});

test("a student pastes a Quizlet set and reviews it both ways", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Spanish");
  const subjectUrl = page.url();
  await page.goto(`${subjectUrl}/flashcards/import`);

  await page.getByText("Quizlet", { exact: true }).click();
  await page.getByLabel("Paste your Quizlet set").fill("perro\tdog\ngato\tcat, or kitten\nperro\tdog\nsolo\n");
  await page.getByRole("button", { name: "Check the cards" }).click();
  await expect(page.getByLabel("Front and back are separated by")).toHaveValue("\t");
  await expect(page.getByText("2 cards ready to import")).toBeVisible();
  await expect(page.getByText("1 row appeared more than once, so it was left out.")).toBeVisible();
  await expect(page.getByText("1 row had nothing on one side, so it was left out.")).toBeVisible();
  await page.getByLabel("Also review each card from back to front").check();
  await page.getByRole("button", { name: "Import 2 cards" }).click();
  await expect(page.getByRole("heading", { name: "Added 2 cards to Spanish" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the import page should not scroll sideways").toBeLessThanOrEqual(1);

  await page.getByRole("link", { name: "Review now" }).click();
  await expect(page).toHaveURL(/\/review\?subject=/);
  await expect(page.getByText(/perro|gato|dog|cat, or kitten/).first()).toBeVisible();
});
