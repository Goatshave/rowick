import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const themeSource = await readFile(new URL("../src/index.css", import.meta.url), "utf8");

test("exposes the stable base and semantic theme token contract", () => {
  for (const token of [
    "--rowick-font-family",
    "--rowick-border-color",
    "--rowick-border-subtle",
    "--rowick-border-strong",
    "--rowick-surface",
    "--rowick-surface-raised",
    "--rowick-surface-muted",
    "--rowick-surface-subtle",
    "--rowick-surface-hover",
    "--rowick-surface-selected",
    "--rowick-text",
    "--rowick-text-muted",
    "--rowick-text-subtle",
    "--rowick-accent",
    "--rowick-accent-hover",
    "--rowick-accent-soft",
    "--rowick-focus",
    "--rowick-danger",
    "--rowick-danger-soft",
    "--rowick-control-height",
    "--rowick-radius-lg",
    "--rowick-shadow-md",
    "--rowick-transition",
  ]) {
    assert.match(themeSource, new RegExp(`${token}:`), `missing theme token ${token}`);
  }

  assert.match(themeSource, /--rowick-border:\s*var\(--rowick-border-color\)/);
});

test("lets styled grids inherit root overrides while preserving standalone semantic defaults", () => {
  assert.match(themeSource, /:where\(\.rowick-grid, \[data-rowick\]:not\(\.rowick-grid \[data-rowick\]\)\)/);
  assert.match(themeSource, /:where\(\s*\[data-rowick-theme="dark"\],/);
  assert.match(themeSource, /\.rowick-grid\[data-rowick-theme="dark"\]/);
  assert.match(themeSource, /\[data-rowick\]\[data-rowick-theme="dark"\]/);
  assert.match(themeSource, /\[data-rowick-theme="dark"\]\s+\.rowick-grid/);
  assert.match(themeSource, /\[data-rowick-theme="dark"\]\s+\[data-rowick\]:not\(\.rowick-grid \[data-rowick\]\)/);
  assert.match(themeSource, /color-scheme:\s*dark/);
  assert.match(themeSource, /--rowick-surface:\s*#171c25/);
  assert.match(themeSource, /--rowick-text:\s*#edf1f7/);
});
