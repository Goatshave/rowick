import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getPlaywrightUiSmokeTargets } from "../scripts/ui-smoke-targets.mjs";
const locales = ["en-US", "de-DE", "fr-FR", "ko-KR", "ja-JP", "hi-IN", "ar-EG"];
const saveRow = (page: Page) => page.locator("fieldset").getByRole("button", { name: /^(Save row|행 저장|行を保存|حفظ الصف)$/ });
const sample = (page: Page, name: string) => page.getByRole("status", { name, exact: true }).textContent();
// Playwright fill uses native insertion, which ends a synthetic composition in
// Firefox. Keep this event-only fixture explicit and separate from real OS IME.
const compositionInput = (field: Locator, value: string) => field.evaluate((element, input) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, input);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, data: input, inputType: "insertCompositionText", isComposing: true }));
}, value);
for (const target of getPlaywrightUiSmokeTargets()) {
  const framework = target.framework, url = new URL("locale", target.url).toString();
  test(`${framework} roundtrips precise money, decimals, Number and Gregorian dates in seven locales`, async ({ page }) => {
    await page.goto(url); await expect(page.getByLabel("Reference ID", { exact: true })).toHaveValue("00123");
    for (const locale of locales) {
      await page.getByLabel("Locale", { exact: true }).selectOption(locale); await page.getByRole("button", { name: "Edit record", exact: true }).click();
      await page.getByLabel("Reference ID", { exact: true }).fill("00000123"); await page.getByLabel("Name", { exact: true }).fill(`${locale} 김 / 日本語 / مرحبا`);
      await page.getByLabel("Exact decimal", { exact: true }).fill((await sample(page, "Large decimal sample"))!); await page.getByLabel("Money", { exact: true }).fill((await sample(page, "Large money sample"))!);
      await page.getByLabel("Number", { exact: true }).fill((await sample(page, "Number sample"))!); await page.getByLabel("Calendar", { exact: true }).fill((await sample(page, "Date sample"))!); await saveRow(page).click();
      const accepted = page.getByRole("status", { name: "Canonical accepted values" }); await expect(accepted).toContainText('"money":"-999999999999999999999.12"');
      await expect(accepted).toContainText('"decimal":"999999999999999999999.123400"'); await expect(accepted).toContainText('"reference":"00000123"');
      await expect(accepted).toContainText('"number":1234.5'); await expect(accepted).toContainText('"date":"2024-02-29"'); await expect(accepted).toContainText(`${locale} 김 / 日本語 / مرحبا`);
      await expect(page.locator("fieldset")).toHaveCount(0);
    }
  });
  test(`${framework} preserves invalid raw input and valid canonical drafts across a locale change`, async ({ page }) => {
    await page.goto(url); await page.getByLabel("Exact decimal", { exact: true }).fill("1,2,3"); await expect(page.getByLabel("Exact decimal", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await saveRow(page).click(); await expect(page.getByRole("status", { name: "Canonical accepted values" })).toContainText('"decimal":"9007199254740993.123400"');
    await page.getByLabel("Locale", { exact: true }).selectOption("de-DE"); await expect(page.getByRole("status", { name: "Locale result" })).toContainText("correct invalid raw input"); await expect(page.getByLabel("Locale", { exact: true })).toHaveValue("en-US");
    await expect(page.getByLabel("Exact decimal", { exact: true })).toHaveValue("1,2,3"); await page.getByLabel("Exact decimal", { exact: true }).fill((await sample(page, "Large decimal sample"))!);
    await page.getByLabel("Name", { exact: true }).fill("preserved 한국어 日本語 مرحبا"); await page.getByLabel("Locale", { exact: true }).selectOption("de-DE");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("preserved 한국어 日本語 مرحبا"); await expect(page.getByLabel("Exact decimal", { exact: true })).toHaveValue((await sample(page, "Large decimal sample"))!);
    await saveRow(page).click(); await expect(page.getByRole("status", { name: "Canonical accepted values" })).toContainText('"decimal":"999999999999999999999.123400"');
  });
  test(`${framework} treats synthetic Korean/Japanese composition as a draft boundary, not real OS evidence`, async ({ page }) => {
    await page.goto(url); await page.getByLabel("Locale", { exact: true }).selectOption("ko-KR"); const name = page.getByLabel("Name", { exact: true });
    await name.focus(); await name.dispatchEvent("compositionstart", { data: "ㅎ" }); await compositionInput(name, "ㅎ"); await saveRow(page).click(); await expect(page.getByRole("status", { name: "Canonical accepted values" })).toContainText('"name":"김정현 / 日本語 / مرحبا"');
    await page.getByLabel("Locale", { exact: true }).selectOption("ja-JP"); await expect(page.getByLabel("Locale", { exact: true })).toHaveValue("ko-KR"); await expect(name).toHaveValue("ㅎ");
    const completed = "한글 日本語 مرحبا\n00123"; await compositionInput(name, completed); await name.dispatchEvent("compositionend", { data: completed });
    await saveRow(page).click(); await expect(page.getByRole("status", { name: "Canonical accepted values" })).toContainText("한글 日本語 مرحبا\\n00123");
    await page.getByRole("button", { name: "Edit record", exact: true }).click(); await page.getByLabel("Locale", { exact: true }).selectOption("ar-EG"); await expect(name).toHaveValue(completed); await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  });
  test(`${framework} reports unsupported locale, unsafe numeric conversion, wrong currency and invalid calendar input`, async ({ page }) => {
    await page.goto(url); await page.getByRole("button", { name: "Try unsupported locale", exact: true }).click(); await expect(page.getByRole("status", { name: "Locale result" })).toContainText("not supported"); await expect(page.getByLabel("Locale", { exact: true })).toHaveValue("en-US");
    await page.getByLabel("Locale", { exact: true }).selectOption("de-DE"); await page.getByLabel("Number", { exact: true }).fill("9.007.199.254.740.993"); await expect(page.getByLabel("Number", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Money", { exact: true }).fill("1.234,50 EUR"); await expect(page.getByLabel("Money", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Calendar", { exact: true }).fill("29.02.2025"); await expect(page.getByLabel("Calendar", { exact: true })).toHaveAttribute("aria-invalid", "true"); await saveRow(page).click();
    await expect(page.getByRole("status", { name: "Canonical accepted values" })).toContainText('"date":"2024-02-29"');
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(result.violations).toEqual([]);
  });
  test(`${framework} keeps default ASCII editing opt-in boundaries after using localized editors`, async ({ page }) => {
    await page.goto(url); await page.getByLabel("Locale", { exact: true }).selectOption("ar-EG"); await expect(page.getByLabel("Money", { exact: true })).not.toHaveValue("-9007199254740993.12");
    await page.goto(new URL("editing", target.url).toString()); await page.getByRole("button", { name: "Edit a", exact: true }).click(); await page.getByLabel("Money", { exact: true }).fill("1,20"); await expect(page.getByLabel("Money", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Money", { exact: true }).fill("1.20"); await page.getByRole("button", { name: "Save row", exact: true }).click(); await expect(page.getByRole("status", { name: "Accepted data" })).toContainText('"money":"1.20"');
  });
  test(`${framework} exposes translated RTL controls and preserves bidi text with keyboard alternatives`, async ({ page }) => {
    await page.goto(url); await page.getByLabel("Locale", { exact: true }).selectOption("ar-EG"); await expect(page.getByRole("button", { name: "حفظ الصف", exact: true })).toBeVisible();
    const name = page.getByLabel("Name", { exact: true }), mixed = "עברית (abc) مرحبا / 日本語 00123"; await name.fill(mixed); await name.focus(); await page.keyboard.press("Enter"); await page.keyboard.type("ASCII 00042");
    await expect(name).toHaveValue(mixed + "\nASCII 00042"); await expect(page.getByRole("status", { name: "Canonical accepted values" })).not.toContainText("ASCII 00042");
    await saveRow(page).focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("status", { name: "Canonical accepted values" })).toContainText("ASCII 00042"); await page.getByRole("button", { name: "Edit record", exact: true }).click(); await expect(name).toHaveValue(mixed + "\nASCII 00042");
    await expect(page.locator("main")).toHaveCSS("direction", "rtl"); const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(result.violations).toEqual([]);
  });
  test(`${framework} blocks locale changes from compositionstart before the first input without replacing displayed columns or text`, async ({ page }) => {
    await page.goto(url); const name = page.getByLabel("Name", { exact: true }), grid = page.getByRole("grid", { name: "Locale records", exact: true });
    await expect(name).toHaveValue("김정현 / 日本語 / مرحبا"); const money = await page.getByLabel("Money", { exact: true }).inputValue(), headers = await grid.getByRole("columnheader").allTextContents();
    await name.focus(); await name.dispatchEvent("compositionstart", { data: "" }); await saveRow(page).click(); await expect(page.locator("fieldset")).toHaveCount(1);
    await page.getByLabel("Locale", { exact: true }).selectOption("de-DE"); await expect(page.getByLabel("Locale", { exact: true })).toHaveValue("en-US");
    await expect(page.getByRole("status", { name: "Locale result" })).toContainText("Finish composition"); await expect(name).toHaveValue("김정현 / 日本語 / مرحبا");
    await expect(page.getByLabel("Money", { exact: true })).toHaveValue(money); expect(await grid.getByRole("columnheader").allTextContents()).toEqual(headers);
    await expect(grid.getByRole("gridcell", { name: "김정현 / 日本語 / مرحبا", exact: true })).toBeVisible();
    await name.dispatchEvent("compositionend", { data: "" }); await page.getByLabel("Locale", { exact: true }).selectOption("de-DE"); await expect(page.getByLabel("Locale", { exact: true })).toHaveValue("de-DE");
    await expect(name).toHaveValue("김정현 / 日本語 / مرحبا"); await expect(page.getByLabel("Money", { exact: true })).not.toHaveValue(money);
  });
}
