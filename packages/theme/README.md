# @rowick/theme

CSS variables and base theme for Rowick.

Use this package when applying the default Rowick styling tokens to a styled UI package.

## Install

```bash
npm install @rowick/theme
```

## Usage

```ts
import "@rowick/theme/css";
```

Import the theme before a framework UI package's CSS. Override the exposed `--rowick-*` custom properties on the styled `.rowick-grid` root to integrate Rowick with an existing design system. The semantic `[data-rowick]` scroller inherits those values, so toolbar controls and grid content use one token set.

## Typed Tokens

Use the optional `@rowick/theme/tokens` entry point when product code owns theme values. It rejects unknown or empty token values at runtime and keeps CSS custom-property names out of application code:

```ts
import { createRowickThemeStyle } from "@rowick/theme/tokens";

const lightGridTheme = createRowickThemeStyle({
  accent: "#155eef",
  focus: "#0e9384",
  surfaceSelected: "#eff4ff",
  rowHeight: "36px",
});
```

Pass the result to React's or Vue's grid-root `style` prop. React applications should cast the framework-neutral object to `CSSProperties`; Vue accepts it directly. Svelte's `style` prop is string-only, so use `createRowickThemeCssText`:

```ts
import { createRowickThemeCssText } from "@rowick/theme/tokens";

const darkGridTheme = createRowickThemeCssText({
  accent: "#84adff",
  focus: "#5fe9d0",
  surfaceSelected: "#102a56",
});
```

Define separate light and dark token sets when colors need different contrast. Apply the selected values to the styled grid root while keeping `data-rowick-theme` on the grid or product ancestor for the remaining bundled defaults. Use product CSS such as `.billing-workspace .rowick-grid { --rowick-accent: ...; }` when themes are static.

## Customize

Apply CSS overrides to the styled grid root:

```css
.billing-workspace .rowick-grid {
  --rowick-font-family: Inter, sans-serif;
  --rowick-accent: #7c3aed;
  --rowick-focus: #0f766e;
  --rowick-surface-selected: #f1edff;
  --rowick-row-height: 36px;
  --rowick-header-height: 40px;
  --rowick-radius-lg: 4px;
  --rowick-shadow-md: 0 12px 28px rgb(16 24 40 / 18%);
}
```

The contract includes semantic surface, border, text, accent, danger, sizing, radius, shadow, and motion tokens. Existing base tokens such as `--rowick-surface`, `--rowick-border-color`, `--rowick-text`, and `--rowick-accent` remain supported; newer tokens let product themes distinguish raised, subtle, hover, selected, strong-border, and status states without overriding internal selectors.

## Dark Theme

Set `data-rowick-theme="dark"` on the grid or an ancestor. Dark tokens apply to the marked element itself and to styled or semantic grid descendants, including controls that are siblings of the semantic `[data-rowick]` scroller. The bundled values remain fully overridable:

```html
<section data-rowick-theme="dark">
  <div data-rowick><!-- framework DataGrid output --></div>
</section>
```

The theme sets `color-scheme` for native controls but does not define the surrounding application shell. Product applications remain responsible for applying matching page, toolbar, and panel colors and for choosing or persisting the active theme. A standalone unstyled `[data-rowick]` still receives the base theme directly; inside a styled `.rowick-grid`, it inherits root overrides instead of redeclaring defaults.

See the [project README](https://github.com/Goatshave/rowick#readme) for framework UI installation and examples.
