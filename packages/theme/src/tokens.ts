export const rowickThemeTokens = {
  fontFamily: "--rowick-font-family",
  fontSize: "--rowick-font-size",
  fontWeightMedium: "--rowick-font-weight-medium",
  fontWeightSemibold: "--rowick-font-weight-semibold",
  borderColor: "--rowick-border-color",
  border: "--rowick-border",
  borderSubtle: "--rowick-border-subtle",
  borderStrong: "--rowick-border-strong",
  surface: "--rowick-surface",
  surfaceRaised: "--rowick-surface-raised",
  surfaceMuted: "--rowick-surface-muted",
  surfaceSubtle: "--rowick-surface-subtle",
  surfaceHover: "--rowick-surface-hover",
  surfaceSelected: "--rowick-surface-selected",
  text: "--rowick-text",
  textMuted: "--rowick-text-muted",
  textSubtle: "--rowick-text-subtle",
  accent: "--rowick-accent",
  accentHover: "--rowick-accent-hover",
  accentSoft: "--rowick-accent-soft",
  focus: "--rowick-focus",
  danger: "--rowick-danger",
  dangerSoft: "--rowick-danger-soft",
  rowHeight: "--rowick-row-height",
  headerHeight: "--rowick-header-height",
  controlHeight: "--rowick-control-height",
  radiusSmall: "--rowick-radius-sm",
  radius: "--rowick-radius",
  radiusLarge: "--rowick-radius-lg",
  shadowSmall: "--rowick-shadow-sm",
  shadowMedium: "--rowick-shadow-md",
  shadowPinnedLeft: "--rowick-shadow-pinned-left",
  shadowPinnedRight: "--rowick-shadow-pinned-right",
  transition: "--rowick-transition",
} as const;

export type RowickThemeToken = keyof typeof rowickThemeTokens;
export type RowickTheme = Partial<Record<RowickThemeToken, string>>;
export type RowickThemeCustomProperty = (typeof rowickThemeTokens)[RowickThemeToken];
export type RowickThemeStyle = Partial<Record<RowickThemeCustomProperty, string>>;

const themeTokenNames = new Set<string>(Object.keys(rowickThemeTokens));

function getValidatedThemeEntries(theme: RowickTheme): Array<[RowickThemeCustomProperty, string]> {
  const entries: Array<[RowickThemeCustomProperty, string]> = [];

  for (const [token, rawValue] of Object.entries(theme)) {
    if (!themeTokenNames.has(token)) {
      throw new TypeError(`Unknown Rowick theme token: ${token}`);
    }
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      throw new TypeError(`Rowick theme token ${token} must be a non-empty string`);
    }

    entries.push([rowickThemeTokens[token as RowickThemeToken], rawValue.trim()]);
  }

  return entries;
}

export function createRowickThemeStyle(theme: RowickTheme): RowickThemeStyle {
  return Object.fromEntries(getValidatedThemeEntries(theme)) as RowickThemeStyle;
}

export function createRowickThemeCssText(theme: RowickTheme): string {
  return getValidatedThemeEntries(theme)
    .map(([property, value]) => {
      if (/[;{}]/u.test(value)) {
        throw new TypeError(`Rowick theme token ${property} cannot contain CSS declaration delimiters`);
      }
      return `${property}: ${value}`;
    })
    .join("; ");
}
