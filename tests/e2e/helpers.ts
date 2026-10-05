import { expect, type Page } from "@playwright/test";

export const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** Signs up a new student and lands on Today. */
export async function signUp(page: Page, name = "Test Student") {
  const email = uniqueEmail();
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name.split(" ")[0]!);
  return { email, password: "correct-horse-battery" };
}

/**
 * Signs out. On a phone the account menu lives in the drawer, so it is opened
 * first; this keeps the auth tests identical on both viewports.
 */
export async function signOut(page: Page) {
  const menu = page.getByRole("button", { name: "Account menu" });
  if (!(await menu.isVisible())) await page.getByRole("button", { name: "Open navigation" }).click();
  await menu.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

export async function createSubject(page: Page, name: string) {
  await page.goto("/subjects");
  await page.getByRole("button", { name: "New subject" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create subject" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}
