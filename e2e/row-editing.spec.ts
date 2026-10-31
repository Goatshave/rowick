import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getPlaywrightUiSmokeTargets } from "../scripts/ui-smoke-targets.mjs";

for (const reference of getPlaywrightUiSmokeTargets()) {
  const framework = reference.framework, url = new URL("editing", reference.url).toString();
  test(`${framework} saves typed row input without coercing precision or choice IDs`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Edit a", exact: true }).click();
    const row = page.getByRole("group", { name: "Row a", exact: true }).filter({ has: page.getByRole("textbox", { name: "Name", exact: true }) });
    await row.getByLabel("Name", { exact: true }).fill("한글 row");
    await row.getByLabel("Amount", { exact: true }).fill("7");
    await row.getByLabel("Money", { exact: true }).fill("999999999999999999999.12");
    await row.getByLabel("Date", { exact: true }).fill("2024-02-29");
    await row.getByLabel("Active", { exact: true }).uncheck();
    await row.getByLabel("Notes", { exact: true }).fill("first line\n한글 second line");
    await row.getByRole("searchbox", { name: "Search Owner" }).fill("Lee");
    await expect(row.getByRole("option", { name: "Lee", exact: true })).toHaveCount(1);
    await row.getByLabel("Owner", { exact: true }).selectOption("002");
    await row.getByRole("button", { name: "Save row", exact: true }).click();
    const accepted = page.getByRole("status", { name: "Accepted data" });
    await expect(accepted).toContainText('"name":"한글 row"'); await expect(accepted).toContainText('"amount":7');
    await expect(accepted).toContainText('"money":"999999999999999999999.12"'); await expect(accepted).toContainText('"date":"2024-02-29"');
    await expect(accepted).toContainText('"active":false'); await expect(accepted).toContainText('"owner":"002"');
    await expect(row).toHaveCount(0);
  });

  test(`${framework} retains invalid raw input and recovers from asynchronous field validation`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Edit a", exact: true }).click();
    const field = page.getByLabel("Amount", { exact: true }); await field.fill("9007199254740992");
    await expect(field).toHaveAttribute("aria-invalid", "true"); await page.getByRole("button", { name: "Save row", exact: true }).click();
    await expect(field).toHaveValue("9007199254740992"); await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"amount":1');
    await field.fill("3"); await page.getByLabel("Name", { exact: true }).fill("invalid"); await page.getByRole("button", { name: "Save row", exact: true }).click();
    await expect(page.getByText("Name is unavailable", { exact: true })).toBeVisible(); await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Name", { exact: true }).fill("Corrected"); await page.getByRole("button", { name: "Save row", exact: true }).click();
    await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"name":"Corrected"');
  });

  test(`${framework} serializes repeated saves and preserves input made while saving`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Edit a", exact: true }).click(); await page.getByRole("button", { name: "Hold saves", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill(" first "); await page.getByRole("button", { name: "Save row", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^saving$/ })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("second"); await page.getByRole("button", { name: "Save row", exact: true }).click();
    await page.getByRole("button", { name: "Save row", exact: true }).click(); await page.getByRole("button", { name: "Release saves", exact: true }).click();
    await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"name":"second"');
    await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"revision":3');
    await expect(page.getByRole("button", { name: "Save row", exact: true })).toHaveCount(0);
  });

  test(`${framework} supports batch undo, partial failure, readonly fields and retry`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Paste two rows", exact: true }).click();
    await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue("Pasted Alpha");
    await page.getByRole("button", { name: "Undo drafts", exact: true }).click(); await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Redo drafts", exact: true }).click(); await expect(page.getByLabel("Name", { exact: true })).toHaveCount(2);
    await expect(page.getByLabel("Money", { exact: true }).nth(1)).toBeDisabled();
    await page.getByRole("button", { name: "Fill amounts", exact: true }).click(); await expect(page.getByLabel("Amount", { exact: true }).first()).toHaveValue("5");
    await page.getByRole("button", { name: "Undo drafts", exact: true }).click(); await expect(page.getByLabel("Amount", { exact: true }).first()).toHaveValue("1");
    await page.getByRole("button", { name: "Fail next save for b", exact: true }).click(); await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"name":"Pasted Alpha"');
    await expect(page.getByText("Temporary save failure", { exact: true })).toBeVisible(); await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Pasted Beta");
    await page.getByRole("button", { name: "Retry save", exact: true }).click(); await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"name":"Pasted Beta"');
  });

  test(`${framework} rebases conflicts and cancels a pending row before reopening it`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Edit a", exact: true }).click(); await page.getByLabel("Name", { exact: true }).fill("Mine");
    await page.getByRole("button", { name: "External update a", exact: true }).click(); await page.getByRole("button", { name: "Rebase draft", exact: true }).click();
    await page.getByRole("button", { name: "Save row", exact: true }).click(); await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"name":"Mine","amount":11');
    await page.getByRole("button", { name: "Edit a", exact: true }).click(); await page.getByRole("button", { name: "Hold saves", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Discarded"); await page.getByRole("button", { name: "Save row", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^saving$/ })).toBeVisible(); await page.getByRole("button", { name: "Cancel row", exact: true }).click();
    await page.getByRole("button", { name: "Edit a", exact: true }).click(); await page.getByLabel("Name", { exact: true }).fill("New draft");
    await page.getByRole("button", { name: "Release saves", exact: true }).click(); await expect(page.getByLabel("Name", { exact: true })).toHaveValue("New draft");
    await expect(page.getByRole("status", { name: "Accepted data" })).not.toContainText("Discarded");
    await page.getByRole("button", { name: "Save row", exact: true }).click(); await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"name":"New draft"');
  });

  test(`${framework} exposes labelled keyboard controls and accessible error descriptions`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Edit a", exact: true }).click();
    const name = page.getByLabel("Name", { exact: true }); await name.focus(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type("Keyboard");
    await page.getByLabel("Amount", { exact: true }).fill("bad");
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(result.violations).toEqual([]);
    await expect(page.getByLabel("Amount", { exact: true })).toHaveAccessibleDescription(/Enter a number/);
    await page.getByRole("button", { name: "Cancel row", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(name).toHaveCount(0);
  });
}
