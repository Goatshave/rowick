import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createRowickThemeCssText,
  createRowickThemeStyle,
  rowickThemeTokens,
} from "../dist/tokens.js";

const themeSource = await readFile(new URL("../src/index.css", import.meta.url), "utf8");

test("keeps the typed token map aligned with every declared CSS custom property", () => {
  const declaredProperties = [...themeSource.matchAll(/(--rowick-[a-z0-9-]+):/gu)].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(Object.values(rowickThemeTokens))].sort(),
    [...new Set(declaredProperties)].sort(),
  );
});

test("maps product theme keys to stable CSS custom properties", () => {
  assert.deepEqual(
    createRowickThemeStyle({
      accent: " #155eef ",
      focus: "#0e9384",
      rowHeight: "36px",
    }),
    {
      "--rowick-accent": "#155eef",
      "--rowick-focus": "#0e9384",
      "--rowick-row-height": "36px",
    },
  );
  assert.equal(rowickThemeTokens.surfaceSelected, "--rowick-surface-selected");
});

test("serializes product themes for string-only style attributes", () => {
  assert.equal(
    createRowickThemeCssText({ accent: "#155eef", radiusLarge: "6px" }),
    "--rowick-accent: #155eef; --rowick-radius-lg: 6px",
  );
});

test("rejects unknown, empty, and declaration-breaking values", () => {
  assert.throws(
    () => createRowickThemeStyle({ typoAccent: "red" }),
    /Unknown Rowick theme token: typoAccent/,
  );
  assert.throws(
    () => createRowickThemeStyle({ accent: " " }),
    /theme token accent must be a non-empty string/,
  );
  assert.throws(
    () => createRowickThemeCssText({ accent: "red; color: transparent" }),
    /cannot contain CSS declaration delimiters/,
  );
});
