import { expect, test } from "@playwright/test";
import { createSubject, signOut, signUp } from "./helpers";

// The sidebar becomes a drawer on small screens (03 UI/UX specification).
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("navigation works through the drawer and closes after navigating", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Anatomy");
  await page.goto("/today");

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: /Anatomy/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anatomy" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("no page scrolls sideways at phone width", async ({ page }) => {
  await signUp(page);
  await createSubject(page, "Pharmacology");

  for (const path of ["/today", "/subjects", "/settings", "/sign-in"]) {
    if (path === "/sign-in") await signOut(page);
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} should not scroll sideways`).toBeLessThanOrEqual(1);
  }
});
