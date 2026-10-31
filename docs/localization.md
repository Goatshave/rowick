# Localization

The styled React, Vue, and Svelte grids accept the same typed `localization` prop.
Pass only the messages you need to replace; Rowick fills the remaining values from
the immutable English dictionary.

```ts
import type { GridLocalizationOverrides } from "@rowick/react-ui";

export const koKR: GridLocalizationOverrides = {
  dataGridLabel: "데이터 표",
  noRows: "행이 없습니다",
  loadingRows: "행을 불러오는 중...",
  searchRowsPlaceholder: "행 검색",
  selectedRows: (count) => `${count}개 행 선택됨`,
  pageStatus: (page, pageCount) => `${pageCount}쪽 중 ${page}쪽`,
  paginationActionLabel: (action) => ({
    first: "첫 페이지",
    previous: "이전 페이지",
    next: "다음 페이지",
    last: "마지막 페이지",
  })[action],
};
```

## Framework usage

React:

```tsx
<DataGrid data={rows} columns={columns} localization={koKR} />
```

Vue:

```ts
h(DataGrid, { options, localization: koKR })
```

Svelte:

```svelte
<DataGrid {options} localization={koKR} />
```

The same contract is exported by `@rowick/react-ui`, `@rowick/vue-ui`,
`@rowick/svelte-ui`, and `@rowick/primitives`. Primitive-only consumers can
resolve a dictionary once and pass it to localization-aware helpers:

```ts
import { createGridLocalization, getPaginationButtonProps } from "@rowick/primitives";

const localization = createGridLocalization(koKR);
const nextButton = getPaginationButtonProps({ action: "next" }, localization);
```

## Contract

The dictionary covers default grid and empty-state labels, loading and error states,
filtering, selection, column visibility, density, pagination, resizing, pinning,
header menus, grouping, row expansion, and editor accessibility labels. Dynamic
messages are functions so consumers control grammar and pluralization.

Explicit `ariaLabel`, `emptyState`, `loadingState`, and `errorState` props take
precedence over localization defaults. Localization is instance-scoped and does not
mutate global state, so different grids can use different languages safely during SSR.

`DEFAULT_GRID_LOCALIZATION` contains the complete English contract.
`createGridLocalization(overrides)` returns a frozen resolved dictionary and leaves
the default dictionary unchanged.

## Filter and pagination labels

`pageStatusUnknown(page)` labels pagination without an exact total. Typed filter
controls use `filterRangeStartLabel(label)`, `filterRangeEndLabel(label)`, and
`clearColumnFilterLabel(label)` alongside existing `filterColumnLabel`, `clear`,
and option labels. These callbacks are optional in complete localization objects;
instance overrides merge with defaults. See [typed filters](filters.md).

## Locale input, exact values and composition

The optional `@rowick/data/locale` entry is part of the unpublished Rowick 0.1.0
candidate. Locale parsing is field-owned and opt-in. It does not change the default
ASCII parsers, detect numeric-looking IDs or alter the browser's global locale.

```ts
import { createLocaleNumberCodec, createLocaleDateCodec } from "@rowick/data/locale";

const money = createLocaleNumberCodec({
  locale: "de-DE",
  style: "currency",
  currency: "EUR",
  currencySign: "accounting",
  maximumFractionDigits: 2,
});
const displayed = money.format("9007199254740993.12");
const parsed = money.parse(displayed);
// { valid: true, value: "9007199254740993.12" }

const calendar = createLocaleDateCodec({ locale: "de-DE" });
calendar.pattern;                     // "DD.MM.YYYY"
calendar.parse("29.02.2024");         // canonical "2024-02-29"
```

The codec reads positional digits, separators, grouping and sign/currency affixes
from `Intl.NumberFormat.formatToParts`; this is a structured formatting API, not
a permissive locale parser. Its options can round values, so the exact decimal
codec assembles validated decimal strings from those patterns instead of passing
the amount through `Number`. Only invariant integer probes use `Intl`/`BigInt`.
See [ECMA-402 NumberFormat](https://tc39.es/ecma402/2025/#numberformat-objects) and
Mozilla's [formatToParts reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/formatToParts).

### Declared schemas and accepted input

| Contract | Behavior |
| --- | --- |
| Default decimal/currency codec | Returns an exact string, retaining leading zeroes, explicit `+`, fractional zeroes and negative zero |
| `valueType: "number"` | Explicit binary64 schema; finite/safe-range and optional integer/min/max checks, with decimal round-trip checks to reject discarded digits or underflow |
| Text/IDs without a codec | Remain opaque strings; `00123` is never automatically parsed as a number |
| Currency | One explicit uppercase three-letter code; no exchange, minor-unit inference or automatic rounding |
| Calendar | Gregorian `YYYY-MM-DD`, years 0001–9999; no time/UTC conversion |

`format` accepts the declared canonical type and throws `LocaleCodecError` on
invalid values. `parse` accepts text and returns `{ valid: true, value }` or
`{ valid: false, code, message }`. Codes distinguish unsupported locale/numbering,
bad input/grouping/currency, precision/range/size, negative values/zero and dates.
Products can translate the stable error code into their own message catalog.
The built-in messages are English. Codec creation rejects unsupported/unknown
options rather than silently enabling compact/scientific/percent conversion.

The supported locale is explicit. Lookup may resolve a region to its supported
language data; `codec.locale` and `numberingSystem` expose the resolved values.
An unavailable language or requested numbering system is rejected. Currency
codes are validated for declared syntax, not against a financial institution's
allowed currency list; business authorization/allowed currencies remain with the
product. Symbol/narrow-symbol input means the field's declared currency, not a
guess among currencies sharing the same symbol. Use `currencyDisplay: "code"`
when the product needs an unambiguous visible code.

The number codec accepts these explicit policies:

- `grouping: "optional"` (default) accepts ungrouped input or the complete locale
  grouping pattern. `"required"` requires grouping when the locale's own pattern
  would use it. `"forbidden"` emits and accepts ungrouped integers only.
- Group sizes and the minimum grouping threshold come from the runtime's locale
  data. `1,2,3` is invalid in en-US; `12,34,567` follows hi-IN's grouping, while
  `1,234,567` does not. Separators are validated before removal, never stripped
  indiscriminately. Exponents, hexadecimal, infinity and numeric separators are
  outside the localized input grammar.
- Digits default to the declared numbering system. `allowAsciiDigits: true`
  additionally permits a wholly ASCII digit value; mixing ASCII and locale digit
  scripts within an integer/fraction/date is still rejected. Positional Unicode
  digits, including surrogate-pair digits, are supported when `Intl` provides a
  distinct ten-digit set. Algorithmic numbering systems are rejected.
- `spaceGrouping: "space-equivalent"` explicitly permits ordinary/nonbreaking/
  narrow-nonbreaking spaces in the same verified grouping positions for a locale
  whose group separator is a space. The default is exact separators/affixes.
  Extra/misplaced spaces are not trimmed away.
- Currency/sign/accounting placement follows the selected locale pattern.
  `currencyInput: "optional"` additionally accepts plain localized decimal syntax;
  it does not invent a bare-parenthesis accounting form. The default requires the
  formatted currency affix. Different currency tokens are not converted.
- `allowNegative: false` and `negativeZero: "reject"` are explicit product rules.
  Otherwise negative zero is preserved. `maximumIntegerDigits` defaults to 128
  (up to 256), `maximumFractionDigits` to 100 (up to 1,000), and
  `maximumInputLength` to 2,048 (up to 4,096). Exceeding a limit is an error,
  not truncation or rounding.

The Number schema retains JavaScript `-0`, but JSON serialization writes it as
`0`. Use the exact decimal string schema when persisted signed zero matters.

Runtime ICU/CLDR data can change spaces or symbol placement across engines.
Persist canonical values and the declared locale/currency/schema, not a formatted
display string intended for a different runtime. Do not reinterpret saved raw
input under a new locale without explicit validation.

For SSR, identical locale options alone do not guarantee identical ICU/CLDR
formatting data on the server and browser. Use consistent formatting data or
safely serialize the initial display strings with the framework, then apply the
browser's formatting after hydration. Keep canonical values alongside that view;
never reparse a server display string using a different client's pattern. Codecs
capture immutable field policies and can be reused for that schema; mutable
editing forms/controllers belong to one request or UI owner and must be disposed
with that owner. Parser/formatter functions and composition buffers are not a
cross-request serialization format.

### Gregorian input and native date controls

The date codec reads year/month/day order and literal separators from a fixed
Gregorian `Intl.DateTimeFormat.formatToParts` sample. Actual user dates are
validated and assembled as strings. Four-digit year and two-digit month/day are
required. Leap-year validation is proleptic Gregorian; invalid dates, two-digit
years, alternate separators, non-Gregorian calendar requests, timestamps and
timezone-bearing strings are rejected. `01/02/2003` has the meaning of the
declared locale's displayed pattern; the codec never guesses another locale.
See [DateTimeFormat parts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts).

Native `<input type="date">` keeps an ISO value even when the browser displays a
localized picker. Its value is not a custom localized text field. Keep the
existing `kind: "date"` editor's ISO contract, or explicitly choose a text editor
with the localized date codec as below. This distinction follows Mozilla's
[native date-input documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date).

```ts
const fields = [
  { id: "reference", label: "Reference ID", kind: "text" }, // no numeric codec
  { id: "money", label: "Amount (EUR)", kind: "currency", scale: 2,
    parse: money.parse, format: (value: unknown) => money.format(value as string) },
  { id: "date", label: `Calendar (${calendar.pattern})`, kind: "text",
    parse: calendar.parse, format: (value: unknown) => calendar.format(value as string) },
];
```

Type the product's formatter values (or validate unknown values) as appropriate
for its schema. In `RowEditingForm`, **both** `parse` and `format` are required
before localized initial input is used. Formatter-only fields retain their
existing canonical editing text. A successful custom parse is still checked
against the field's type, required/range/scale and enabled-choice rules. Invalid
raw text remains available for correction; parser/formatter exceptions become
field feedback. Formatter errors do not crash rendering or change accepted data.

Run `/locale` in the React/Vue/Svelte basic examples. Their six fields keep IDs
as text, large money/decimals as strings, a separate explicit Number field and
a Gregorian text date. Locale changes preserve valid canonical drafts. A change
is blocked while a field has invalid raw input or an active composition, so the
same string cannot silently acquire a different interpretation. English,
German, French, Korean, Japanese, Hindi/Indian grouping and Egyptian Arabic are
exercised with translated Korean/Japanese/Arabic panel labels and exact accepted
JSON evidence.

### RTL, bidirectional text and input evidence

The examples use `dir` for the product surface and `<bdi>` around mixed-direction
preview text/JSON. Opaque text/IDs are preserved; numeric codecs do not normalize
the rest of a record. They accept the locale formatter's known affix presentation
marks (or that affix with those marks omitted), but do not strip arbitrary bidi
controls from numeric bodies. Grid physical column/pin/keyboard direction belongs
to the advanced layout controller's explicit RTL contract; text direction and
numeric parsing are separate choices.

Automatic composition tests keep partial Korean/Japanese composition in raw
drafts and prevent saving or changing locale until composition ends. They then
verify exact committed text across locale/RTL changes. This tests event handling;
synthetic browser events are **not** evidence of an operating-system IME, candidate
window, screen reader, touchscreen or pen. The [UI Events composition model](https://www.w3.org/TR/uievents/#events-compositionevents)
describes composition boundaries and key-event composition flags, with behavior
dependent on the input system and device.

The current automated scope is the three renderers and Chromium/Firefox/WebKit
engines, unit round-trips, invalid input, keyboard controls, bidi string retention
and automated accessibility checks. Final-source manual evidence remains pending:

- macOS Korean and Japanese IME with candidate selection, cancellation, Enter,
  Tab/blur, re-opened cells and delayed acknowledgements.
- Windows Korean/Japanese IME and NVDA, plus macOS VoiceOver announcements/focus.
- Real touch/pen input and keyboard alternatives on the declared browser/OS
  matrix, including zoom/high contrast and RTL pinned layouts.

Record exact commit, browser/OS, input method/assistive-technology versions and
observations in the release evidence. Manual results must match the reviewed
source; synthetic composition and emulated viewports do not satisfy these gates.
