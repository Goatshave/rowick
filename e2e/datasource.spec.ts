import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { getPlaywrightUiSmokeTargets } from "../scripts/ui-smoke-targets.mjs";

for (const target of getPlaywrightUiSmokeTargets()) {
  const framework = target.framework, url = new URL("server-data", target.url).toString();
  test(`${framework} bounds remote rows while navigating ten million records with correct absolute indexes`, async ({ page }) => {
    await page.goto(url); const grid = page.getByRole("grid", { name: "Remote records", exact: true });
    await expect(page.getByRole("status").filter({ hasText: /^20 loaded rows/ })).toContainText("10000000 total rows");
    await expect(grid.getByRole("columnheader").first()).toHaveAttribute("aria-sort", "none");
    await grid.getByRole("button", { name: "name", exact: true }).click();
    await expect(grid.getByRole("columnheader").first()).toHaveAttribute("aria-sort", "none");
    await expect(grid.locator('[role="row"][data-row-id]').first()).toHaveAttribute("data-row-id", "record:0");
    for (let index = 1; index <= 5; index++) {
      await page.getByRole("button", { name: "Next block", exact: true }).click(); await expect(grid.locator(`[role="row"][data-row-id="record:${index * 20}"]`)).toBeVisible();
      const evidence = JSON.parse(await page.getByRole("status", { name: "Datasource evidence" }).innerText()); expect(evidence.cachedRows).toBeLessThanOrEqual(60); expect(evidence.blocks).toBeLessThanOrEqual(3);
      expect(await grid.locator('[role="row"][data-row-id]').count()).toBeLessThanOrEqual(25);
    }
    await page.getByRole("button", { name: "Last block", exact: true }).click(); const last = grid.locator('[role="row"][data-row-id="record:9999980"]'); await expect(last).toBeVisible(); await expect(last).toHaveAttribute("aria-rowindex", "9999982");
    await page.getByRole("button", { name: "Offset query", exact: true }).click(); await expect(grid.locator('[role="row"][data-row-id="record:3"]')).toHaveAttribute("aria-rowindex", "5");
  });

  test(`${framework} handles opaque unknown-total cursors without inventing an unknown filtered rank`, async ({ page }) => {
    await page.goto(url); await expect(page.getByRole("gridcell", { name: "Record 0", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cursor unknown total", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: /^20 loaded rows/ })).toContainText("unknown total");
    await expect(page.getByRole("button", { name: "Last block", exact: true })).toBeDisabled(); await page.getByRole("button", { name: "Next block", exact: true }).click();
    await expect(page.locator('[role="row"][data-row-id="record:20"]')).toHaveAttribute("aria-rowindex", "22");
    await page.getByRole("button", { name: "Filtered cursor", exact: true }).click(); const row = page.locator('[role="row"][data-row-id="record:998"]'); await expect(row).toBeVisible();
    await expect(row).not.toHaveAttribute("aria-rowindex", /.+/); await expect(page.getByRole("grid", { name: "Remote records", exact: true })).toHaveAttribute("aria-rowcount", "-1");
    await page.getByRole("button", { name: "Next block", exact: true }).click(); await expect(page.locator('[role="row"][data-row-id="record:10998"]')).toBeVisible();
    await page.getByRole("button", { name: "Previous block", exact: true }).click(); await expect(row).toBeVisible();
  });

  test(`${framework} recovers HTTP read errors, preserves logical selection and cancels old query responses`, async ({ page }) => {
    await page.goto(url); const row = page.locator('[role="row"][data-row-id="record:1"]'); await expect(row).toBeVisible(); await row.getByRole("gridcell", { name: "Record 1", exact: true }).click();
    await page.getByRole("button", { name: "Fail read once", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Temporary datasource read failure" })).toBeVisible(); await expect(row).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Retry read", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Temporary datasource read failure" })).toHaveCount(0); await expect(row).toHaveAttribute("aria-selected", "true");
    const slow = page.waitForRequest((request) => request.url().includes("/datasource/read?") && request.url().includes("delay=400")); await page.getByRole("button", { name: "Slow read", exact: true }).click(); await slow;
    await page.getByRole("button", { name: "Small query", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: /^20 loaded rows/ })).toContainText("40 total rows");
    await expect(page.getByRole("status", { name: "Datasource evidence" })).toContainText('"limitToFirst":40'); await expect(page.getByRole("status").filter({ hasText: /^0 selected IDs$/ })).toBeVisible();
  });

  test(`${framework} shares all-query exclusions across export and idempotent bulk retry`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Small query", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Record 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Select all matching", exact: true }).click(); await page.getByRole("gridcell", { name: "Record 1", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "All matching rows selected, 1 exclusions" })).toBeVisible(); await page.getByRole("button", { name: "Next block", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Record 20", exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Export selection", exact: true }).click(); const download = await downloadPromise;
    const path = await download.path(); expect(path).toBeTruthy(); const exported = JSON.parse(await readFile(path!, "utf8")) as { id: string }[];
    expect(exported).toHaveLength(39); expect(exported.some((row) => row.id === "record:1")).toBe(false); await expect(page.getByRole("status").filter({ hasText: "Exported 39 matching rows" })).toBeVisible();
    const payloads: unknown[] = []; page.on("request", (request) => { if (request.url().includes("/datasource/bulk?")) payloads.push(request.postDataJSON()); });
    await page.getByRole("button", { name: "Lose bulk response", exact: true }).click(); await page.getByRole("button", { name: "Apply to selection", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Bulk response lost after commit" })).toBeVisible(); await page.getByRole("button", { name: "Retry operation", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "39 matching; 23 changed; 4 denied" })).toBeVisible(); expect(payloads).toHaveLength(2); expect(payloads[1]).toEqual(payloads[0]);
  });

  test(`${framework} loads group/tree child blocks and resynchronizes real live revision gaps`, async ({ page }) => {
    await page.goto(url); await expect(page.getByRole("gridcell", { name: "Record 0", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Group query", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Open records", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Load children of Open records", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Record 1", exact: true })).toBeVisible(); await expect(page.getByRole("gridcell", { name: "Record 0", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Root rows", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Open records", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Small query", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Record 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Load children of Record 1", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Child 0 of record:1", exact: true })).toBeVisible(); await expect(page.getByRole("status").filter({ hasText: /^3 loaded rows/ })).toContainText("3 total rows");
    await page.getByRole("button", { name: "Root rows", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Record 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Revision gap", exact: true }).click(); await expect(page.getByText("Data changed; refresh required", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Refresh data", exact: true }).click(); await expect(page.getByText("Data changed; refresh required", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Datasource evidence" })).toContainText('"revision":4');
    await page.getByRole("button", { name: "Live delete", exact: true }).click(); await expect(page.getByRole("gridcell", { name: "Record 1", exact: true })).toHaveCount(0); await expect(page.getByRole("status").filter({ hasText: /^20 loaded rows/ })).toContainText("39 total rows");
  });

  test(`${framework} exposes bounded keyboard controls and automated accessible remote states`, async ({ page }) => {
    await page.goto(url); await expect(page.getByRole("gridcell", { name: "Record 0", exact: true })).toBeVisible();
    const next = page.getByRole("button", { name: "Next block", exact: true }); await next.focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("gridcell", { name: "Record 20", exact: true })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(result.violations).toEqual([]);
    await page.getByRole("button", { name: "Cursor unknown total", exact: true }).click(); await expect(page.getByRole("grid", { name: "Remote records", exact: true })).toHaveAttribute("aria-rowcount", "-1");
  });

  test(`${framework} does not carry local feedback or operation messages into a new query universe`, async ({ page }) => {
    await page.goto(url); await expect(page.getByRole("gridcell", { name: "Record 0", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Export selection", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Select rows before starting an operation" })).toBeVisible();
    await page.getByRole("button", { name: "Small query", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: /^20 loaded rows/ })).toContainText("40 total rows");
    await expect(page.getByRole("alert").filter({ hasText: "Select rows before starting an operation" })).toHaveCount(0);
    await page.getByRole("button", { name: "Select all matching", exact: true }).click(); const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export selection", exact: true }).click(); await download; await expect(page.getByRole("status").filter({ hasText: "Exported 40 matching rows" })).toBeVisible();
    await page.getByRole("button", { name: "Massive query", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: /^20 loaded rows/ })).toContainText("10000000 total rows");
    await expect(page.getByRole("status").filter({ hasText: "Exported 40 matching rows" })).toHaveCount(0);
  });
}
