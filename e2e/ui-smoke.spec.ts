import { expect, test, type Page } from "@playwright/test";
import { getPlaywrightUiSmokeTargets } from "../scripts/ui-smoke-targets.mjs";

for (const example of getPlaywrightUiSmokeTargets()) {
  test(`${example.framework} serves its declared Rowick favicon`, async ({ page, request }) => {
    const failures: string[] = [];
    page.on("response", (response) => {
      if (/favicon/i.test(response.url()) && response.status() >= 400) failures.push(response.url());
    });
    await page.goto(example.url);
    const icon = page.locator('link[rel="icon"]');
    await expect(icon).toHaveCount(1);
    const href = await icon.getAttribute("href");
    expect(href).toBeTruthy();
    const response = await request.get(new URL(href!, page.url()).href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(await response.text()).toContain(">Rowick</title>");
    expect(failures).toEqual([]);
  });

  test(`${example.framework} reference UI renders a usable grid shell`, async ({ page }) => {
    const pageErrors = capturePageErrors(page);

    await page.goto(example.url);

    await expect(page.locator("[data-rowick]").first()).toBeVisible();
    const primaryHeader = page.locator(`[role="columnheader"][data-column-id="${example.smokeCheck.primaryColumnId}"]`);
    await expect(primaryHeader).toBeVisible();
    if (!example.smokeCheck.headerControls.directPinningControls) {
      await expect(page.locator(".rowick-grid__pinning-controls")).toHaveCount(0);
    }
    if (example.smokeCheck.headerControls.actionMenu) {
      await expect(primaryHeader.getByRole("button", { name: `Open ${example.smokeCheck.primaryColumnId} column menu` })).toBeVisible();
    }
    const exportButton = page.getByRole("button", { name: "Export CSV" });
    await expect(exportButton).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^rowick-.+\.csv$/);

    const appShell = page.locator("main.app-shell");
    const grid = page.locator("[data-rowick]").first();
    await expectThemeTokens(grid, example.smokeCheck.productThemeTokens.light);
    await expectSemanticMarkers(page, example.smokeCheck.semanticMarkers);
    const darkThemeButton = page.getByRole("button", { name: "Use dark theme" });
    await expect(darkThemeButton).toBeVisible();
    await darkThemeButton.click();
    await expect(appShell).toHaveAttribute("data-rowick-theme", "dark");
    await expect.poll(() => page.locator("[data-rowick]").evaluate((element) => getComputedStyle(element).getPropertyValue("--rowick-surface").trim())).toBe("#171c25");
    await expectThemeTokens(grid, example.smokeCheck.productThemeTokens.dark);
    await expectSemanticMarkers(page, example.smokeCheck.semanticMarkers);

    await page.reload();
    await expect(appShell).toHaveAttribute("data-rowick-theme", "dark");
    const lightThemeButton = page.getByRole("button", { name: "Use light theme" });
    await expect(lightThemeButton).toBeVisible();
    await lightThemeButton.click();
    await expect(appShell).toHaveAttribute("data-rowick-theme", "light");
    await expectThemeTokens(grid, example.smokeCheck.productThemeTokens.light);
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("rowick:reference-theme:v1"))).toBe("light");

    const columnManagementToggle = page.getByRole("button", { name: "Manage columns" });
    const columnManagement = page.getByLabel("Column management");
    await expect(columnManagementToggle).toHaveAttribute("aria-expanded", "false");
    await expect(columnManagement).toBeHidden();
    await columnManagementToggle.click();
    await expect(columnManagementToggle).toHaveAttribute("aria-expanded", "true");
    await expect(columnManagement).toBeVisible();
    await expect(columnManagement.getByTestId("managed-column-count")).toHaveText(example.smokeCheck.managedColumnCount);
    await expect(page.getByLabel("Header menu composition status")).toHaveAttribute("data-active", "false");
    await expect(page.getByLabel("Server edit status")).toHaveAttribute("data-active", "false");

    await expect.poll(async () => page.locator('[role="row"]').count()).toBeGreaterThan(5);
    await expect.poll(async () => page.locator('[role="gridcell"]').count()).toBeGreaterThan(10);

    const scroller = page.locator(".rowick-grid__scroller");
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect.poll(async () => getVirtualizedRenderStats(page).then((stats) => stats.firstVirtualRowIndex)).toBeGreaterThanOrEqual(
      example.smokeCheck.minimumDeepScrollRowIndex,
    );
    const virtualizedStats = await getVirtualizedRenderStats(page);
    expect(virtualizedStats.rowCount).toBeLessThan(example.smokeCheck.maxRenderedRowCount);
    expect(virtualizedStats.lastVirtualRowIndex).toBeGreaterThan(virtualizedStats.firstVirtualRowIndex);
    expect(pageErrors).toEqual([]);
  });
}

async function expectSemanticMarkers(
  page: Page,
  checks: Array<{
    columnId: string;
    values: Array<{ rowId: string; text: string; className: string }>;
  }>,
) {
  for (const check of checks) {
    const markerStyles = [];
    for (const value of check.values) {
      const cell = page.locator(`[role="gridcell"][data-row-id="${value.rowId}"][data-column-id="${check.columnId}"]`);
      await expect(cell).toHaveText(value.text);
      expect((await cell.getAttribute("class"))?.split(/\s+/)).toContain(value.className);
      markerStyles.push(await cell.evaluate((element) => {
        const marker = getComputedStyle(element, "::before");
        return {
          backgroundColor: marker.backgroundColor,
          width: marker.width,
          height: marker.height,
        };
      }));
    }

    expect(markerStyles.map((style) => style.width)).toEqual(check.values.map(() => "7px"));
    expect(markerStyles.map((style) => style.height)).toEqual(check.values.map(() => "7px"));
    expect(new Set(markerStyles.map((style) => style.backgroundColor)).size).toBe(check.values.length);
  }
}

async function expectThemeTokens(
  grid: ReturnType<Page["locator"]>,
  expected: { accent: string; focus: string; radiusLarge: string },
) {
  await expect.poll(() => grid.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      accent: style.getPropertyValue("--rowick-accent").trim(),
      focus: style.getPropertyValue("--rowick-focus").trim(),
      radiusLarge: style.getPropertyValue("--rowick-radius-lg").trim(),
    };
  })).toEqual(expected);
}

async function getVirtualizedRenderStats(page: Page) {
  return page.locator('[role="row"][data-virtual-index]').evaluateAll((rows) => {
    const virtualIndexes = rows.flatMap((row) => {
      const value = Number(row.getAttribute("data-virtual-index"));
      return Number.isInteger(value) ? [value] : [];
    });

    return {
      rowCount: virtualIndexes.length,
      firstVirtualRowIndex: virtualIndexes.length > 0 ? Math.min(...virtualIndexes) : -1,
      lastVirtualRowIndex: virtualIndexes.length > 0 ? Math.max(...virtualIndexes) : -1,
    };
  });
}

function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  return errors;
}
