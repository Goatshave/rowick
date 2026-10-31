import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getPlaywrightUiSmokeTargets } from "../scripts/ui-smoke-targets.mjs";

for (const reference of getPlaywrightUiSmokeTargets()) {
  const framework = reference.framework;
  const url = new URL("transactions", reference.url).toString();
  test(`${framework} applies an accepted transaction in product state while preserving selection`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole("button", { name: "Add row", exact: true })).toBeEnabled();
    const first = page.locator('[role="row"][data-row-id="a"]');
    await first.locator('[role="gridcell"][data-column-id="name"]').click();
    await expect(first).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Update first row" }).click();
    await expect(first.locator('[data-column-id="amount"]')).toHaveText("2");
    await expect(first).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Add row", exact: true }).click();
    await expect(page.getByRole("gridcell", { name: "Added row", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remove first row" }).click();
    await expect(first).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Transaction result" })).toHaveText("Row removed");
    await expect(page.getByRole("gridcell", { name: "Beta", exact: true })).toBeVisible();
  });

  test(`${framework} rejects a duplicate atomically and remains usable`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole("button", { name: "Try duplicate ID" })).toBeEnabled();
    const rows = page.locator('.rowick-grid__body [role="row"][data-row-id]');
    await expect(rows).toHaveCount(2);
    await page.getByRole("button", { name: "Try duplicate ID" }).click();
    await expect(page.getByRole("status", { name: "Transaction result" })).toContainText("Transaction rejected; data unchanged");
    await expect(rows).toHaveCount(2);
    await page.getByRole("button", { name: "Add row", exact: true }).click();
    await expect(rows).toHaveCount(3);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
  });
}
