import { expect, test, type Page } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

const CAPITALS: Record<string, string> = {
  "Capital of France": "Paris",
  "Capital of Spain": "Madrid",
  "Capital of Italy": "Rome",
  "Capital of Portugal": "Lisbon",
};

async function addCards(page: Page) {
  await page.getByRole("button", { name: "Add a topic" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Capitals");
  await dialog.getByRole("button", { name: "Add topic" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name: "Flashcards" }).click();
  await page.getByRole("button", { name: "New card" }).click();
  dialog = page.getByRole("dialog", { name: "New card" });
  await dialog.getByLabel("Capitals").check();
  for (const [front, back] of Object.entries(CAPITALS)) {
    await dialog.getByLabel("Front").fill(front);
    await dialog.getByLabel("Back").fill(back);
    await dialog.getByRole("button", { name: "Add card" }).click();
    await expect(dialog.getByLabel("Front")).toHaveValue("");
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

test("a student quizzes themselves, sees their score by topic and retries what they missed", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Geography");
  await addCards(page);

  // The subject's Flashcards tab starts a quiz on that subject.
  const main = page.locator("#main");
  await main.getByRole("link", { name: "Quiz", exact: true }).click();
  await expect(page).toHaveURL(/\/quiz\?subject=/);
  await expect(main.getByLabel("Quiz me on")).toHaveValue(/^subject:/);
  await main.getByText("Type the answer").click();
  await main.getByRole("button", { name: "Start quiz" }).click();
  await expect(page.getByText("Question 1 of 4")).toBeVisible();

  // Type each answer: one with a slip, one wrong.
  for (let i = 1; i <= 4; i++) {
    await expect(page.getByText(`Question ${i} of 4`)).toBeVisible();
    const front = (await page.getByTestId("quiz-question").innerText()).trim();
    const answer = CAPITALS[front]!;
    const typed = answer === "Madrid" ? "Barcelona" : answer === "Lisbon" ? "Lisbn" : answer;
    await page.getByLabel("Your answer").fill(typed);
    await page.keyboard.press("Enter");
    const feedback = page.getByRole("status").filter({ hasText: /Right|Not quite/ });
    if (answer === "Madrid") {
      await expect(feedback).toContainText("Not quite");
      await expect(feedback).toContainText("The answer is Madrid");
    } else if (answer === "Lisbon") {
      await expect(feedback).toContainText("Right, but check the spelling");
    } else {
      await expect(feedback).toContainText("Right");
    }
    await page.getByRole("button", { name: i === 4 ? "See results" : "Next question" }).click();
  }

  await expect(page.getByRole("heading", { level: 1, name: "Quiz results" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "3 of 4 right" })).toBeVisible();
  await expect(main.getByText("75%")).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: "Questions you missed" })).toBeVisible();
  await expect(main.getByText("You said Barcelona.")).toBeVisible();

  // Rate the topic while the result is fresh.
  const capitals = main.getByRole("group", { name: "How confident are you about Capitals?" });
  await capitals.getByRole("button", { name: "Getting there" }).click();
  await expect(capitals.getByRole("button", { name: "Getting there" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    main
      .getByRole("group", { name: "How confident are you about Capitals?" })
      .getByRole("button", { name: "Getting there" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Retry the one missed.
  await main.getByRole("button", { name: "Retry the one you missed" }).click();
  await expect(page.getByText("Question 1 of 1")).toBeVisible();
  await expect(page.getByTestId("quiz-question")).toHaveText("Capital of Spain");
  await page.getByLabel("Your answer").fill("madrid");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "See results" }).click();
  await expect(main.getByRole("heading", { name: "Full marks!" })).toBeVisible();

  // Both quizzes are listed, newest first.
  await page.getByRole("link", { name: "New quiz" }).click();
  const recent = main.getByRole("listitem").filter({ hasText: "Geography" });
  await expect(recent).toHaveCount(2);
  await expect(recent.first()).toContainText("100%");
  await expect(recent.last()).toContainText("75%");
});

test("multiple choice works from the keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard shortcuts are for desktop.");
  await signUp(page);
  await createSubject(page, "Geography");
  await addCards(page);

  await page.goto("/quiz");
  const main = page.locator("#main");
  await main.getByText("Multiple choice").click();
  await main.getByRole("button", { name: "Start quiz" }).click();
  await expect(page.getByText("Question 1 of 4")).toBeVisible();

  for (let i = 1; i <= 4; i++) {
    await expect(page.getByText(`Question ${i} of 4`)).toBeVisible();
    const front = (await page.getByTestId("quiz-question").innerText()).trim();
    const options = await page.getByRole("group", { name: "Options" }).getByRole("button").allInnerTexts();
    expect(options).toHaveLength(4);
    const right = options.findIndex((o) => o.includes(CAPITALS[front]!));
    await page.keyboard.press(String(right + 1));
    await expect(page.getByRole("status").filter({ hasText: "Right" })).toBeVisible();
    // Enter moves on: the next button has focus.
    await page.keyboard.press("Enter");
  }
  await expect(main.getByRole("heading", { name: "Full marks!" })).toBeVisible();
});
