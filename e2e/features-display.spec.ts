import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getPlaywrightUiSmokeTargets } from "../scripts/ui-smoke-targets.mjs";

// CSS/DPR and forced-colors emulation are automatic evidence, not real OS zoom,
// screen-reader, native high-contrast, touch/pen or OS clipboard verification.
const profiles = [
  { name: "390 CSS pixels", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, forcedColors: "none" as const },
  { name: "200% equivalent reflow", viewport: { width: 640, height: 450 }, deviceScaleFactor: 2, forcedColors: "none" as const },
  { name: "forced colors at 390 CSS pixels", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, forcedColors: "active" as const },
];
const features = ["editing", "filtering", "server-data", "layout", "analytics", "locale"] as const;
type Feature = typeof features[number];
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const gridSelector = '[role="grid"],table,[role="table"]';

async function ready(page: Page, feature: Feature) {
  if (feature === "editing") await expect(page.getByRole("region", { name: "Row editing", exact: true })).toBeVisible();
  else if (feature === "filtering") await expect(page.locator(".rowick-filter-panel")).toBeVisible();
  else if (feature === "server-data") await expect(page.getByRole("gridcell", { name: "Record 0", exact: true })).toBeVisible();
  else if (feature === "layout") await expect(page.getByRole("grid", { name: "Current page 1 grid layout", exact: true })).toBeVisible();
  else if (feature === "analytics") await expect(page.getByRole("table", { name: "Pivot results", exact: true })).toBeVisible();
  else await expect(page.getByLabel("Reference ID", { exact: true })).toHaveValue("00123");
}

/** Inspect the document and product controls without hiding or restyling overflow. */
async function reflow(page: Page, phase: string) {
  const layout = await page.evaluate((gridSelector) => {
    const width = document.documentElement.clientWidth, hidden = (element: Element) => !element.checkVisibility() || element.closest('[aria-hidden="true"]');
    const title = (element: Element) => element.getAttribute("aria-label") ?? element.getAttribute("id") ?? element.textContent?.trim().slice(0, 90) ?? element.tagName;
    const controls = [...document.querySelectorAll<HTMLElement>('main button,main input:not([type="hidden"]),main select,main textarea,main label,main legend,main [role="alert"],main h1,main h2')]
      .filter((element) => !hidden(element) && !element.closest(gridSelector));
    const clipped = controls.flatMap((element) => {
      const box = element.getBoundingClientRect(); if (!box.width || !box.height) return [];
      if (box.left < -1 || box.right > width + 1) return [{ element: title(element), reason: "outside document viewport", left: box.left, right: box.right }];
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor); if (!["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) continue;
        const parent = ancestor.getBoundingClientRect(); if (box.left < parent.left - 1 || box.right > parent.right + 1) return [{ element: title(element), reason: "clipped by non-grid container", left: box.left, right: box.right }];
      }
      if (element.matches('button,label,legend,[role="alert"],h1,h2')) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          for (const text of range.getClientRects()) {
            if (!text.width || !text.height) continue;
            if (text.left < -1 || text.right > width + 1) return [{ element: title(element), reason: "text outside document viewport", left: text.left, right: text.right }];
            for (let ancestor = element; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement!) {
              if (!["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(ancestor).overflowX)) continue;
              const parent = ancestor.getBoundingClientRect(); if (text.left < parent.left - 1 || text.right > parent.right + 1) return [{ element: title(element), reason: "text clipped by non-grid container", left: text.left, right: text.right }];
            }
          }
        }
      }
      return [];
    });
    return { overflow: document.documentElement.scrollWidth - width, clipped };
  }, gridSelector);
  expect(layout.overflow, `${phase}: wide data must stay inside its own scroller`).toBeLessThanOrEqual(1);
  expect(layout.clipped, `${phase}: commands, labels and errors must reflow without clipping`).toEqual([]);
}

async function visibleKeyboardFocus(page: Page, command: Locator) {
  // Visual focus measurement begins after prior validation rendering settles.
  // The layout scenario separately verifies a new intent inside the same RAF.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // WebKit defaults to native form-only Tab traversal. Option-Tab is its
  // native all-controls path; no application tabindex or OS setting changes.
  const webkit = page.context().browser()?.browserType().name() === "webkit";
  await expect(command).toBeEnabled(); await command.focus(); await page.keyboard.press(webkit ? "Alt+Tab" : "Tab"); await page.keyboard.press(webkit ? "Alt+Shift+Tab" : "Shift+Tab"); await expect(command).toBeFocused();
  const indicator = await command.evaluate((element) => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), color: style.outlineColor, visible: element.matches(":focus-visible"), left: box.left, right: box.right, viewport: document.documentElement.clientWidth }; });
  expect(indicator.visible).toBe(true); expect(["none", "hidden"]).not.toContain(indicator.style); expect(indicator.width).toBeGreaterThanOrEqual(1); expect(indicator.color).not.toBe("rgba(0, 0, 0, 0)"); expect(indicator.left).toBeGreaterThanOrEqual(-1); expect(indicator.right).toBeLessThanOrEqual(indicator.viewport + 1);
}

async function errorState(page: Page, feature: Feature, rtl: boolean): Promise<{ command: Locator; field?: Locator; gridError?: boolean }> {
  if (feature === "editing") {
    await button(page, "Edit a").click(); const field = page.getByLabel("Amount", { exact: true }); await field.fill("invalid"); await expect(field).toHaveAttribute("aria-invalid", "true");
    return { command: button(page, "Save row"), field };
  }
  if (feature === "filtering") {
    const filters = page.getByRole("region", { name: "Advanced filters", exact: true }); await filters.getByRole("button", { name: "Add group", exact: true }).click();
    const group = page.getByRole("group", { name: "Filter group 1.1", exact: true }).filter({ has: page.getByRole("combobox", { name: "Match", exact: true }) }); await group.getByRole("button", { name: "Add condition", exact: true }).click();
    const condition = page.getByRole("group", { name: "Condition 1.1.1", exact: true }); await condition.getByLabel("Column", { exact: true }).selectOption("amount"); const field = condition.getByLabel("Value", { exact: true }); await field.fill("invalid"); await button(page, "Apply filters").click(); await expect(field).toHaveAttribute("aria-invalid", "true");
    return { command: button(page, "Apply filters"), field };
  }
  if (feature === "server-data") {
    await button(page, "Fail read once").click(); await expect(page.getByRole("alert").filter({ hasText: "Temporary datasource read failure" })).toBeVisible(); return { command: button(page, "Retry read") };
  }
  if (feature === "layout") {
    const cell = page.locator('[data-row-id="row-00001"] [data-column-id="amount"]'); await cell.focus(); await page.keyboard.press("Enter"); const field = page.getByRole("textbox", { name: "Edit Amount", exact: true }); await expect(field).toBeFocused(); await field.fill("invalid"); await field.press("Enter"); await expect(field).toHaveAttribute("aria-invalid", "true");
    // A new focus intent must beat the queued validation focus restoration;
    // use one browser task so this is independent from the visual settling above.
    await field.evaluate((editor) => { editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); const next = [...document.querySelectorAll<HTMLButtonElement>(".rowick-layout button")].find((candidate) => candidate.textContent === "Commit cell"); if (!next) throw new Error("Commit command missing"); next.focus(); });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); await expect(button(page, "Commit cell")).toBeFocused();
    return { command: button(page, "Commit cell"), field, gridError: true };
  }
  if (feature === "analytics") {
    await button(page, "Fail view storage").click(); await expect(page.getByRole("alert")).toContainText("storage quota failure"); return { command: button(page, "Save pivot view") };
  }
  if (rtl) { await page.getByLabel("Locale", { exact: true }).selectOption("ar-EG"); await expect(page.locator("main")).toHaveAttribute("dir", "rtl"); }
  const field = page.getByLabel("Number", { exact: true }); await field.fill("invalid"); await expect(field).toHaveAttribute("aria-invalid", "true"); return { command: page.getByRole("button", { name: /^(Save row|حفظ الصف)$/, exact: true }), field };
}

async function errorSemantics(page: Page, field?: Locator) {
  await expect(page.getByRole("alert").first()).toBeVisible();
  if (!field) return;
  const description = await field.getAttribute("aria-describedby"); expect(description).toBeTruthy();
  const relationship = await field.evaluate((element) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map((id) => { const target = document.getElementById(id); return { exists: Boolean(target), text: target?.textContent?.trim() ?? "", visible: Boolean(target?.checkVisibility()) }; }));
  expect(relationship.length).toBeGreaterThan(0); for (const error of relationship) expect(error).toMatchObject({ exists: true, visible: true }); expect(relationship.some((error) => error.text.length > 0)).toBe(true);
}

async function scrollWideData(page: Page) {
  const scrollers = page.locator(".rowick-grid__scroller,.rowick-layout__viewport");
  for (let index = 0; index < await scrollers.count(); index++) {
    const scroller = scrollers.nth(index); const result = await scroller.evaluate((element) => { const maximum = element.scrollWidth - element.clientWidth, old = element.scrollLeft; element.scrollLeft = maximum; if (maximum > 1 && !element.scrollLeft) element.scrollLeft = -maximum; const position = element.scrollLeft; element.scrollLeft = old; element.dispatchEvent(new Event("scroll", { bubbles: true })); return { maximum, position, width: element.clientWidth, overflow: getComputedStyle(element).overflowX }; });
    expect(result.width).toBeGreaterThan(0); if (result.maximum > 1) { expect(["auto", "scroll"]).toContain(result.overflow); expect(Math.abs(result.position)).toBeGreaterThan(0); }
  }
}

async function forcedSelection(page: Page, feature: Feature) {
  if (feature === "analytics") {
    // Native listbox paint belongs to the browser/OS. Check its selected semantics
    // and keyboard focus, without inventing a computed-color fidelity claim.
    const axes = page.getByRole("listbox", { name: "Row axes", exact: true }); await expect(axes.locator("option:checked")).toHaveCount(2); await visibleKeyboardFocus(page, axes); return;
  }
  const first = feature === "layout" ? page.locator('[data-row-id="row-00001"] [data-column-id="name"]') : page.locator('.rowick-grid__cell[data-row-id][data-column-id]').first();
  const initialColumn = await first.getAttribute("data-column-id"); await first.click(); await page.keyboard.press(feature === "layout" ? "Shift+ArrowDown" : "ArrowRight");
  const focused = feature === "layout" ? page.locator('[data-row-id="row-00002"] [data-column-id="name"]') : page.locator('.rowick-grid__cell[data-focused="true"]');
  if (feature !== "layout") await expect(focused).not.toHaveAttribute("data-column-id", initialColumn!);
  await expect(focused).toBeFocused(); await expect(focused).toBeVisible();
  const focus = await focused.evaluate((element) => { const style = getComputedStyle(element); return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), color: style.outlineColor }; });
  expect(focus.style).not.toBe("none"); expect(focus.width).toBeGreaterThanOrEqual(2); expect(focus.color).not.toBe("rgba(0, 0, 0, 0)");
  const selected = feature === "layout" ? page.locator('.rowick-layout td[aria-selected="true"]') : page.locator('.rowick-grid__row[data-selected="true"] .rowick-grid__cell'); expect(await selected.count()).toBeGreaterThan(0);
  const styles = await selected.evaluateAll((elements) => { const probe = document.createElement("span"); probe.style.cssText = "display:none;background:Canvas"; document.body.appendChild(probe); const canvas = getComputedStyle(probe).backgroundColor; probe.remove(); return elements.map((element) => { const style = getComputedStyle(element); return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), color: style.outlineColor, background: style.backgroundColor, canvas, focused: element === document.activeElement }; }); });
  expect(styles.some((style) => !style.focused && style.width < focus.width), "focused and other selected cells need distinct non-color cues").toBe(true);
  for (const style of styles) { expect(style.background).toBe(style.canvas); expect(style.style).not.toBe("none"); expect(style.width).toBeGreaterThanOrEqual(1); expect(style.color).not.toBe("rgba(0, 0, 0, 0)"); }
  // A selected cell keeps its cue after keyboard focus moves back to the toolbar.
  await page.getByRole("button").filter({ visible: true }).first().focus();
  const preserved = await selected.first().evaluate((element) => { const style = getComputedStyle(element); return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }; }); expect(preserved.style).not.toBe("none"); expect(preserved.width).toBeGreaterThanOrEqual(1);
}

for (const target of getPlaywrightUiSmokeTargets()) for (const profile of profiles) test.describe(`${target.framework} feature display: ${profile.name}`, () => {
  test.use({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, forcedColors: profile.forcedColors, reducedMotion: "reduce" });
  for (const feature of features) test(`${feature} reflows commands/errors and preserves keyboard/style accessibility`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); await page.goto(new URL(feature, target.url).toString()); await ready(page, feature);
    if (profile.deviceScaleFactor === 2) expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    if (profile.forcedColors === "active") { expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true); await forcedSelection(page, feature); }
    await reflow(page, "initial"); await scrollWideData(page);
    const state = await errorState(page, feature, profile.forcedColors === "active"); await errorSemantics(page, state.field); await visibleKeyboardFocus(page, state.command); await reflow(page, "error state");
    if (state.field && !state.gridError) await visibleKeyboardFocus(page, state.field);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(result.violations).toEqual([]); expect(errors).toEqual([]);
  });
});
