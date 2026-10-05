import { expect, test } from "@playwright/test";
import { signOut, signUp, uniqueEmail } from "./helpers";

test("a visitor can sign up, sign out and sign back in", async ({ page }) => {
  const { email, password } = await signUp(page, "Ada Lovelace");

  await signOut(page);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ada");
});

test("signing in with the wrong password shows one clear message", async ({ page }) => {
  const { email } = await signUp(page);
  await signOut(page);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("don't match");
});

test("the sign-up form validates before submitting", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Grace");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Use at least 10 characters")).toBeVisible();
});

test("signed-out visitors are sent to sign-in, and signed-in ones past it", async ({ page }) => {
  await page.goto("/subjects");
  await expect(page).toHaveURL(/\/sign-in/);

  await signUp(page);
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/today/);
});

test("a password reset request always reports the same thing", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
});
