import { expect, test } from "@playwright/test";
import { createSubject, signUp } from "./helpers";

test("the setup checklist tracks real progress", async ({ page }) => {
  await signUp(page);
  await expect(page.getByText("0 of 5 done")).toBeVisible();

  await createSubject(page, "Economics");
  await page.goto("/today");
  await expect(page.getByText("1 of 5 done")).toBeVisible();
  await expect(page.getByRole("link", { name: /Economics/ }).first()).toBeVisible();
});

test("settings save the user's name and preferences", async ({ page }) => {
  await signUp(page, "Alan Turing");
  await page.goto("/settings");

  // Waiting for the field's own value confirms the page has hydrated before typing.
  const nameField = page.getByLabel("Name");
  await expect(nameField).toHaveValue("Alan Turing");
  await nameField.fill("Alan M. Turing");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Alan M. Turing");

  await page.getByLabel("Theme").selectOption("dark");
  await page.getByLabel("Time zone").selectOption("Africa/Johannesburg");
  await page.getByRole("button", { name: "Save" }).nth(1).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.reload();
  await expect(page.getByLabel("Time zone")).toHaveValue("Africa/Johannesburg");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("pages load without Content Security Policy violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy"))
      violations.push(message.text());
  });
  await signUp(page);
  await createSubject(page, "Geography");
  await page.getByRole("navigation", { name: "Subject sections" }).getByRole("link", { name: "Documents" }).click();
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
  expect(violations).toEqual([]);
});
