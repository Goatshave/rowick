import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getPlaywrightUiSmokeTargets } from "../scripts/ui-smoke-targets.mjs";
function condition(page: Page, path: string) { return page.getByRole("group", { name: `Condition ${path}`, exact: true }); }
async function addRootCondition(page: Page) { await page.getByRole("region", { name: "Advanced filters", exact: true }).getByRole("button", { name: "Add condition", exact: true }).last().click(); }
for (const target of getPlaywrightUiSmokeTargets()) {
  const url = new URL("filtering", target.url).toString(), framework = target.framework;
  test(`${framework} builds nested AND/OR conditions and applies them atomically`, async ({ page }) => {
    await page.goto(url); const filters = page.getByRole("region", { name: "Advanced filters", exact: true });
    await filters.getByRole("button", { name: "Add group", exact: true }).click();
    const group = page.getByRole("group", { name: "Filter group 1.1", exact: true }).filter({ has: page.getByRole("combobox", { name: "Match", exact: true }) });
    await group.getByLabel("Match", { exact: true }).selectOption("or"); await group.getByRole("button", { name: "Add condition", exact: true }).click();
    await condition(page, "1.1.1").getByLabel("Value", { exact: true }).fill("Alpha"); await group.getByRole("button", { name: "Add condition", exact: true }).click();
    await condition(page, "1.1.2").getByLabel("Value", { exact: true }).fill("Beta"); await addRootCondition(page);
    const amount = condition(page, "1.2"); await amount.getByLabel("Column", { exact: true }).selectOption("amount"); await amount.getByLabel("Operator", { exact: true }).selectOption("gte"); await amount.getByLabel("Value", { exact: true }).fill("15");
    await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Alpha, Beta, Gamma"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Beta"); await expect(filters.getByRole("status")).toHaveText("3 active filter conditions");
    await page.getByRole("button", { name: "Reset filters", exact: true }).click(); await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Alpha, Beta, Gamma");
  });
  test(`${framework} retains invalid numeric input and compares exact decimal strings`, async ({ page }) => {
    await page.goto(url); await addRootCondition(page); const row = condition(page, "1.1");
    await row.getByLabel("Column", { exact: true }).selectOption("amount"); await row.getByLabel("Value", { exact: true }).fill("not a number"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(row.getByLabel("Value", { exact: true })).toHaveValue("not a number"); await expect(row.getByLabel("Value", { exact: true })).toHaveAttribute("aria-invalid", "true"); await expect(row.getByLabel("Value", { exact: true })).toHaveAccessibleDescription(/finite number/);
    await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Alpha, Beta, Gamma");
    await row.getByLabel("Column", { exact: true }).selectOption("money"); await row.getByLabel("Operator", { exact: true }).selectOption("gt"); await row.getByLabel("Value", { exact: true }).fill("9007199254740993.15"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Beta, Gamma");
  });
  test(`${framework} preserves calendar and boolean types and validates range order`, async ({ page }) => {
    await page.goto(url); await addRootCondition(page); const date = condition(page, "1.1");
    await date.getByLabel("Column", { exact: true }).selectOption("date"); await date.getByLabel("Operator", { exact: true }).selectOption("between"); await date.getByLabel("Value", { exact: true }).fill("2026-10-01"); await date.getByLabel("Upper value", { exact: true }).fill("2026-10-02");
    await addRootCondition(page); const active = condition(page, "1.2"); await active.getByLabel("Column", { exact: true }).selectOption("active"); await active.getByLabel("Value", { exact: true }).selectOption("false"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Beta"); await page.getByRole("button", { name: "Reset filters", exact: true }).click(); await addRootCondition(page);
    const number = condition(page, "1.1"); await number.getByLabel("Column", { exact: true }).selectOption("amount"); await number.getByLabel("Operator", { exact: true }).selectOption("between"); await number.getByLabel("Value", { exact: true }).fill("20"); await number.getByLabel("Upper value", { exact: true }).fill("10"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(number.getByLabel("Value", { exact: true })).toHaveAttribute("aria-invalid", "true"); await number.getByLabel("Value", { exact: true }).fill("10"); await number.getByLabel("Upper value", { exact: true }).fill("20"); await page.getByRole("button", { name: "Apply filters", exact: true }).click(); await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Alpha, Beta");
  });
  test(`${framework} saves layout and query and restores a persisted view after reload`, async ({ page }) => {
    await page.goto(url); await addRootCondition(page); await condition(page, "1.1").getByLabel("Value", { exact: true }).fill("Beta"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    const columns = page.getByRole("region", { name: "Columns", exact: true }); await columns.getByLabel("Region visible", { exact: true }).uncheck(); await columns.getByLabel("Name pin", { exact: true }).selectOption("left"); await columns.getByLabel("Amount width", { exact: true }).fill("280"); await columns.getByLabel("Amount width", { exact: true }).press("Tab");
    await page.getByLabel("View name", { exact: true }).fill("Operations"); await page.getByRole("button", { name: "Save view", exact: true }).click();
    await page.getByRole("button", { name: "Reset filters", exact: true }).click(); await columns.getByLabel("Region visible", { exact: true }).check(); await columns.getByLabel("Name pin", { exact: true }).selectOption("right"); await page.getByRole("button", { name: "Restore view", exact: true }).click();
    await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Beta"); await expect(columns.getByLabel("Region visible", { exact: true })).not.toBeChecked(); await expect(columns.getByLabel("Name pin", { exact: true })).toHaveValue("left"); await expect(columns.getByLabel("Amount width", { exact: true })).toHaveValue("280");
    await page.reload(); await page.getByLabel("Choose view", { exact: true }).selectOption({ label: "Operations" }); await page.getByRole("button", { name: "Restore view", exact: true }).click(); await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Beta");
  });
  test(`${framework} facets exclude their own conditions while retaining other filters`, async ({ page }) => {
    await page.goto(url); const facets = page.getByRole("region", { name: "Filter candidates", exact: true }); await facets.getByLabel("Candidate column", { exact: true }).selectOption("region");
    await expect(facets.getByRole("button", { name: "Seoul (2)", exact: true })).toBeVisible(); await facets.getByRole("button", { name: "Seoul (2)", exact: true }).click(); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Alpha, Beta"); await facets.getByLabel("Candidate column", { exact: true }).selectOption("name"); await expect(facets.getByRole("button", { name: "Gamma (1)", exact: true })).toHaveCount(0);
    await facets.getByRole("searchbox", { name: "Search candidates", exact: true }).fill("Beta"); await facets.getByRole("button", { name: "Beta (1)", exact: true }).click(); await page.getByRole("button", { name: "Apply filters", exact: true }).click(); await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Beta");
    await facets.getByLabel("Candidate column", { exact: true }).selectOption("region"); await expect(facets.getByRole("button", { name: "Seoul (1)", exact: true })).toBeVisible(); await expect(facets.getByRole("button", { name: "Tokyo (1)", exact: true })).toHaveCount(0);
  });
  test(`${framework} reports storage and malformed-view failures and remains usable`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Simulate storage failure", exact: true }).click(); await page.getByLabel("View name", { exact: true }).fill("Safe"); await page.getByRole("button", { name: "Save view", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Storage is unavailable");
    await expect(page.getByRole("option", { name: "Safe", exact: true })).toHaveCount(0); await page.getByRole("button", { name: "Restore storage", exact: true }).click(); await page.getByRole("button", { name: "Save view", exact: true }).click(); await expect(page.getByRole("option", { name: "Safe", exact: true })).toHaveCount(1);
    await page.getByLabel("View JSON", { exact: true }).fill('{"version":9}'); await page.getByRole("button", { name: "Import view", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Unsupported saved view version"); await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Alpha, Beta, Gamma");
    await page.getByRole("button", { name: "Clear saved views", exact: true }).click(); await expect(page.getByRole("option", { name: "Safe", exact: true })).toHaveCount(0);
  });
  test(`${framework} retries asynchronous candidates and rejects obsolete responses`, async ({ page }) => {
    await page.goto(`${url}?remote=1`); const facets = page.getByRole("region", { name: "Filter candidates", exact: true }); await facets.getByLabel("Candidate column", { exact: true }).selectOption("region"); await expect(facets.getByRole("button", { name: "Seoul (2)", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fail next candidate search", exact: true }).click(); await facets.getByRole("searchbox", { name: "Search candidates", exact: true }).fill("Tokyo"); await expect(facets.getByRole("alert")).toContainText("Candidate service is unavailable"); await facets.getByRole("button", { name: "Retry candidates", exact: true }).click(); await expect(facets.getByRole("button", { name: "Tokyo (1)", exact: true })).toBeVisible();
    await facets.getByRole("searchbox", { name: "Search candidates", exact: true }).fill("slow"); await facets.getByRole("searchbox", { name: "Search candidates", exact: true }).fill("Seoul"); await expect(facets.getByRole("button", { name: "Seoul (2)", exact: true })).toBeVisible(); await expect(facets.getByRole("button", { name: "Tokyo (1)", exact: true })).toHaveCount(0);
  });
  test(`${framework} supports keyboard removal and exposes accessible field errors`, async ({ page }) => {
    await page.goto(url); await addRootCondition(page); const row = condition(page, "1.1"); await row.getByLabel("Column", { exact: true }).selectOption("amount"); await row.getByLabel("Value", { exact: true }).fill("bad"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(result.violations).toEqual([]);
    await row.getByRole("button", { name: "Remove Condition 1.1", exact: true }).focus(); await page.keyboard.press("Enter"); const add = page.getByRole("button", { name: "Add condition", exact: true }); await expect(add).toBeFocused(); await page.keyboard.press("Enter");
    await condition(page, "1.1").getByLabel("Value", { exact: true }).fill("Beta"); await page.getByRole("button", { name: "Apply filters", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("status", { name: "Matching rows" })).toHaveText("Beta");
  });
}
