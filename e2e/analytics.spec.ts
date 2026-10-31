import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { getPlaywrightUiSmokeTargets } from "../scripts/ui-smoke-targets.mjs";
const unzip = (bytes: Uint8Array): Record<string, string> => JSON.parse(execFileSync("python3", ["-c", "import base64,io,json,sys,zipfile\nz=zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.read())))\nassert z.testzip() is None\nprint(json.dumps({n:z.read(n).decode('utf-8') for n in z.namelist()}))"], { input: Buffer.from(bytes).toString("base64"), encoding: "utf8", maxBuffer: 2_000_000 }));
for (const target of getPlaywrightUiSmokeTargets()) {
  const url = new URL("analytics", target.url).toString();
  test(`${target.framework} configures pivot axes/metrics, totals and bounded row/column pages`, async ({ page }) => {
    await page.goto(url); await expect(page.getByRole("table", { name: "Pivot results" })).toBeVisible();
    await expect(page.getByRole("listbox", { name: "Row axes", exact: true }).locator("option:checked")).toHaveText(["Region", "City"]);
    await expect(page.getByRole("listbox", { name: "Column axes", exact: true }).locator("option:checked")).toHaveText(["Quarter"]);
    await expect(page.getByRole("status").filter({ hasText: /^8 pivot rows, 6 result columns$/ })).toBeVisible();
    await page.getByRole("button", { name: "Next rows", exact: true }).click(); await expect(page.getByRole("rowheader", { name: "Grand total", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next columns", exact: true }).click();
    const total = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Grand total", exact: true }) });
    await expect(total.getByRole("cell").nth(1)).toHaveText("42"); await expect(total.getByRole("cell").nth(2)).toHaveText("5");
    await page.getByLabel("Row axes", { exact: true }).selectOption(["region"]); await page.getByLabel("Operation", { exact: true }).first().selectOption("avg");
    await page.getByLabel("Descending rows", { exact: true }).check(); await page.getByRole("button", { name: "Apply pivot", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^4 pivot rows, 6 result columns$/ })).toBeVisible();
    await page.getByRole("button", { name: "Next columns", exact: true }).click();
    await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Grand total", exact: true }) }).getByRole("cell").nth(1)).toHaveText("10.5");
  });
  test(`${target.framework} keeps filtered totals and saved configuration recovery consistent`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Save pivot view", exact: true }).click(); await expect(page.getByText("Pivot view saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Filter KR", exact: true }).click();
    await page.getByRole("button", { name: "Next columns", exact: true }).click();
    await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Grand total", exact: true }) }).getByRole("cell").nth(1)).toHaveText("35");
    await page.getByRole("button", { name: "Fail view storage", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("storage quota failure");
    await page.getByRole("button", { name: "Corrupt saved view", exact: true }).click(); await page.getByRole("button", { name: "Restore pivot view", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Unsupported pivot configuration");
    await page.getByRole("button", { name: "Show all records", exact: true }).click(); await page.getByRole("button", { name: "Try column limit", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("column limit"); await expect(page.getByRole("status").filter({ hasText: /^8 pivot rows, 6 result columns$/ })).toBeVisible();
    await page.getByRole("button", { name: "Reset pivot", exact: true }).click(); await expect(page.getByRole("alert")).toHaveCount(0);
  });
  test(`${target.framework} downloads typed real XLSX and protects CSV sensitive/formula data`, async ({ page }) => {
    await page.goto(url); await page.getByRole("combobox", { name: "Export scope", exact: true }).selectOption("records");
    const xlsxWait = page.waitForEvent("download"); await page.getByRole("button", { name: "Export XLSX", exact: true }).click(); const xlsx = await xlsxWait;
    const xlsxPath = await xlsx.path(); expect(xlsxPath).not.toBeNull(); const bytes = await readFile(xlsxPath!); expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
    const parts = unzip(bytes); expect(parts["xl/sharedStrings.xml"]).toContain("9007199254740993.12"); expect(parts["xl/sharedStrings.xml"]).toContain("001"); expect(parts["xl/sharedStrings.xml"]).toContain("=HYPERLINK"); expect(parts["xl/sharedStrings.xml"]).not.toContain("never-export-this");
    expect(parts["xl/worksheets/sheet1.xml"]).toContain('t="b"'); expect(parts["xl/styles.xml"]).toContain("yyyy-mm-dd");
    const csvWait = page.waitForEvent("download"); await page.getByRole("button", { name: "Export CSV", exact: true }).click(); const csv = await csvWait;
    const text = await readFile((await csv.path())!, "utf8"); expect(text).toContain("'=HYPERLINK"); expect(text).not.toContain("never-export-this"); expect(text).toContain("한글");
  });
  test(`${target.framework} cancels progress and recovers from a custom exporter failure`, async ({ page }) => {
    // Keep the 500ms demo export pending while real browser input is delivered.
    // Slow CI browsers can otherwise finish it before the cancel click arrives.
    const start = new Date("2026-01-01T00:00:00Z");
    await page.clock.install({ time: start });
    await page.goto(url); const downloads: string[] = []; page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.clock.pauseAt(new Date(start.getTime() + 60_000));
    await page.getByRole("button", { name: "Export SLOW", exact: true }).click(); await expect(page.getByRole("progressbar", { name: "Export progress" })).toBeVisible();
    const cancel = page.getByRole("button", { name: "Cancel export", exact: true });
    await expect(cancel).toBeEnabled(); await cancel.click();
    await expect(page.getByRole("status").filter({ hasText: /^Export cancelled:/ })).toBeVisible();
    await page.clock.runFor(1_000);
    await expect(page.getByRole("status").filter({ hasText: /^Export cancelled:/ })).toBeVisible(); expect(downloads).toEqual([]);
    await page.clock.resume();
    await page.getByRole("button", { name: "Fail next custom export", exact: true }).click(); await page.getByRole("button", { name: "Export JSON", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Simulated exporter failure");
    const downloadWait = page.waitForEvent("download"); await page.getByRole("button", { name: "Export JSON", exact: true }).click(); const file = await downloadWait;
    const data = JSON.parse(await readFile((await file.path())!, "utf8")); expect(data.version).toBe(1); expect(data.rows.length).toBe(8); await expect(page.getByRole("alert")).toHaveCount(0);
    const printWait = page.waitForEvent("download"); await page.getByRole("button", { name: "Print layout", exact: true }).click(); const print = await printWait;
    const html = await readFile((await print.path())!, "utf8"); expect(html).toContain("<thead>"); expect(html).toContain("Grand total"); expect(html).not.toContain("<script>");
  });
  test(`${target.framework} exports through the real same-origin server and rejects forged columns`, async ({ page, request }) => {
    await page.goto(url); await page.getByRole("combobox", { name: "Export scope", exact: true }).selectOption("records"); await page.getByRole("button", { name: "Filter KR", exact: true }).click();
    const fileWait = page.waitForEvent("download"); await page.getByRole("button", { name: "Export SERVER-XLSX", exact: true }).click(); const file = await fileWait;
    const parts = unzip(await readFile((await file.path())!)); expect(parts["xl/sharedStrings.xml"]).toContain("Seoul"); expect(parts["xl/sharedStrings.xml"]).not.toContain("Tokyo"); expect(parts["xl/sharedStrings.xml"]).not.toContain("never-export-this");
    const endpoint = new URL("__rowick/analytics/export", target.url).toString();
    const forged = await request.post(endpoint, { headers: { "x-rowick-example-key": "local-example" }, data: { version: 1, queryKey: "analytics:all", query: { region: "all" }, selection: null, columns: ["secret"], format: "xlsx", maxRows: 10 } }); expect(forged.status()).toBe(400);
    const denied = await request.post(endpoint, { data: { version: 1 } }); expect(denied.status()).toBe(403);
  });
  test(`${target.framework} keeps analytical controls keyboard accessible and has no automated WCAG violations`, async ({ page }, testInfo) => {
    await page.goto(url); const rows = page.getByLabel("Row axes", { exact: true }); await rows.focus(); await expect(rows).toBeFocused();
    const descending = page.getByLabel("Descending rows", { exact: true }); await descending.focus(); await page.keyboard.press("Space"); await expect(descending).toBeChecked();
    await page.getByRole("button", { name: "Apply pivot", exact: true }).focus(); await page.keyboard.press("Enter");
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(result.violations).toEqual([]);
    await expect(page.getByRole("table", { name: "Pivot results" }).getByRole("row")).toHaveCount(5);
    await page.screenshot({ path: testInfo.outputPath("analytics.png"), fullPage: true });
  });
}
