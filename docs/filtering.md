# Advanced filters, candidates and saved views

These features are part of the unpublished Rowick 0.1.0 candidate.
The core evaluates a bounded, versioned expression;
optional `/filtering` entries provide condition-building and settings UI.

```ts
import { createGrid } from "@rowick/core";
import { createFilterPanelController } from "@rowick/data/filtering";

const grid = createGrid({
  data,
  columns: [
    { accessorKey: "name", header: "Name", filterValueType: "text" },
    { accessorKey: "amount", header: "Amount", filterValueType: "number" },
    { accessorKey: "balance", header: "Balance", filterValueType: "decimal" },
    { accessorKey: "day", header: "Day", filterValueType: "date" },
    { accessorKey: "active", header: "Active", filterValueType: "boolean" },
  ],
  getRowId: (row) => row.id,
});
const panel = createFilterPanelController({
  grid,
  // Access browser storage in the product's mounted lifecycle. It may throw;
  // the controller reports storage errors while retaining existing views.
  storage: localStorage,
  storageKey: "orders:views:v1",
});
```

For the packaged DataGrid, create the controller from `onGridReady(grid)` and
dispose it when that grid leaves the screen. Keep the authoritative grid/data
owner external. Initialize controllers in an effect, `onMounted`, or an external
owner; avoid subscribing during a discarded React render.

```tsx
import { FilterPanel } from "@rowick/react-ui/filtering";
import "@rowick/react-ui/filtering.css";
<FilterPanel controller={panel} />;
```

```ts
import { FilterPanel } from "@rowick/vue-ui/filtering";
import "@rowick/vue-ui/filtering.css";
// h(FilterPanel, { controller: panel, idPrefix: "orders-filter" })
```

```svelte
<script>
  import { FilterPanel } from "@rowick/svelte-ui/filtering";
  import "@rowick/svelte-ui/filtering.css";
</script>
<FilterPanel controller={panel} idPrefix="orders-filter" />
```

Vue/Svelte use a page-unique, stable `idPrefix` to link field errors without a
global ID counter. React uses `useId`. The native form controls support keyboard
operation. Removing a condition returns focus to its containing group's Add
condition button. `labels` translates headings, controls, operators and status
formatters. `sections` chooses any combination of `filters`, `columns`, `facets`
and `views`; products can place panels in their own menu, drawer or dialog. The
headless controller exposes the same commands for a custom design.

## Expression contract

```ts
grid.setFilterExpression({
  version: 1,
  root: {
    kind: "group", operator: "and", children: [
      { kind: "condition", columnId: "amount", operator: "gte", value: 100 },
      { kind: "group", operator: "or", children: [
        { kind: "condition", columnId: "name", operator: "contains", value: "Kim" },
        { kind: "condition", columnId: "active", operator: "eq", value: true },
      ] },
    ],
  },
});
```

The expression combines with existing column filters and quick/global filters
using AND. Existing custom filter functions retain precedence for their own
simple column filter and are not serialized as functions. With
`manualFiltering`, the grid validates the expression and leaves row filtering to
the data source. Query setters reset the page index to zero unless
`autoResetPageIndex: false` is explicitly chosen. A controlled owner receives a
single complete state proposal and decides when to accept it.

Conditions support equality, inequality, membership, ordered comparisons,
inclusive `between`, text containment/prefix/suffix, and empty/nonempty checks.
The column policy determines the allowed operations. `filterOperators` may
restrict the default set. Grouping supports AND/OR at each level. `root: null`
matches all rows. An empty AND group is true; an empty OR group is false.

`number` uses finite JavaScript numbers without string coercion. `decimal`
compares arbitrary-precision decimal strings by digits, including values above
2⁵³; it does not convert balances to Number. Decimal spelling does not affect
equality (`"01.20"` equals `"1.2"`). `date` expects valid calendar strings
`YYYY-MM-DD` with years 0001–9999 and does not coerce Date/UTC values. Boolean
expects booleans. Text comparison is locale-independent and case-insensitive
by default; a text condition may opt into `caseSensitive: true`. It does not
strip accents or apply a locale-specific collation.

Missing values normalize to null. `eq: null` matches null and undefined.
`is-empty` also matches the empty string, while whitespace remains nonempty.
An empty membership list matches nothing; an empty not-in list matches every
valid value of that column's type. Invalid typed source values fail closed for
typed comparisons. The builder's membership field expects a JSON array, so
strings, booleans, null and numbers remain distinct. Numeric inputs use a dot
decimal separator; formatting and locale parsing are product concerns.

`validateFilterExpression`, `compileFilterExpression`, `parseFilterExpression`
and `serializeFilterExpression` are shared between browser and server. Validate
against the server's own allowlist of columns/operators. Never trust a client's
column definitions or concatenate expression values into SQL. Use parameterized
queries and recheck permissions and query scope on the server.

The defaults limit expressions to 200 nodes, depth 8, 1,000 characters per literal
and 200 items per set. Additional total literal and serialized-size budgets bound
aggregate payloads. Unknown versions/properties/columns/operators, cycles,
getters, sparse lists and type-incompatible values reject explicitly. The
validated result is an immutable copy. The builder retains invalid raw input,
shows its field error, and leaves the active expression unchanged until Apply.
If another owner replaces the expression while a local draft is dirty, Apply
requires Reload instead of overwriting that external change. Controlled proposals
remain visible until the owner accepts them.

## Facets and asynchronous candidates

`grid.getFacetedRowModel(columnId)` excludes the target column's simple filter and
its advanced conditions, while retaining the other conditions, custom filters
and global filter. Removing advanced conditions prunes newly empty groups; the
remaining groups keep their AND/OR operators. The core validates the complete
expression before pruning so a forbidden condition cannot be hidden by faceting.
The per-column model cache has a fixed bound. Tree counts describe kept model
rows, including structural ancestors retained by tree filtering.

The panel calculates one selected column at a time. `calculateFacets` can also
consume a product's own rows and value accessor. It returns value/count candidates,
typed minimum/maximum, scan and match counts, invalid-value count, truncation and
a distinct-count lower bound. Text spellings group case-insensitively; equivalent
decimal spellings share a count and retain the first representative value. Null
and undefined share the missing candidate. Invalid typed values do not become
misleading candidates.

The defaults retain at most 200 distinct values and scan at most 100,000 supplied
rows. Counts for retained values remain exact within the scanned rows, even after
the distinct cap is reached. A scan cap is reported separately from a value cap;
the UI identifies partial counts/ranges. Candidate search checks the scanned
data before applying the value cap, so it can find values beyond the initial
candidate list. Focus/selection changes do not rebuild facets. For manual/server
data, local counts are explicitly labeled as loaded rows only.

Provide `facetSearch` for server candidates:

```ts
const panel = createFilterPanelController({
  grid,
  getContextKey: () => currentAuthorizedQueryId,
  facetSearch: async ({ columnId, query, expression, limit, signal, contextKey }) => {
    const response = await fetch("/api/order-candidates", {
      method: "POST", signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId, query, expression, limit, contextKey }),
    });
    if (!response.ok) throw new Error("Candidate search failed");
    return response.json(); // { values: [{ value, count }], truncated: boolean }
  },
});
```

`expression` is an immutable snapshot with the target conditions removed. The
opaque `contextKey` identifies the product's full authorized query, including any
simple/global filters, tenant and permission scope; the server must resolve and
validate that context. The server computes counts for the full authorized data
set and enforces its own response/query limits.

`createFacetSearchController` deduplicates an identical in-flight request, aborts
obsolete requests, limits the retained result set, validates types/counts/duplicate
keys, exposes loading/error/retry and fences late or disposed responses. The
default timeout is 30 seconds. Abort does not force an uncooperative provider to
stop; transport should honor the signal. A context change invalidates the old
response. Products should call `panel.refresh()` for external schema/context
changes that do not otherwise notify the grid.

## Column settings and saved views

The Columns section supports visibility, pinning, width and keyboard-accessible
relative ordering. It keeps at least one visible column. `canConfigureColumn`
can restrict product-owned columns; saved view restoration checks those
restrictions too. Column search renders at most 100 settings rows at a time.
Visibility is a display setting, not an authorization boundary; protect sensitive
data in the data source and export policy.

Saved view version 1 embeds the existing layout preferences version 1, plus
sorting, simple/global filters, grouping, the advanced expression and page size.
It does not save row data, row selection, edit drafts, focus, range selections or
the previous page index. Restore starts at page zero and submits all saved grid
state in one update. For controlled grids this remains a state proposal.
Density is accepted through `getDensity`/`onDensityChange` because it belongs to
the styled UI rather than core state.

`createSavedGridView`, `validateSavedGridView`, `serializeSavedGridView`,
`parseSavedGridView` and `applySavedGridView` support headless use.
`importLayoutPreferencesView` imports a primitive preferences v1 object while
preserving the current query. JSON import adds a validated view to the list;
Restore is the explicit step that changes grid state.

Restoration validates the full saved payload before touching grid state. Unknown
or removed referenced columns, forbidden sorting/grouping/filter operations,
duplicate columns, invalid sizes, conflicting pins and hiding every column fail
the restore. A schema change does not silently remove an active filter and widen
the result set. Products may supply explicit, bounded `viewMigrations` to upgrade
older versions; migration output must match the declared version and current
schema. Version 1 layout preferences remain compatible with the existing
primitive serializer.

Storage is optional; without it views live for the session. The default collection
contains at most 20 views and 512 KiB of JSON; a view is bounded to 256 KiB.
Storage read/parse/write/remove failures appear in the UI. A failed write keeps
the previous in-memory list. Clear saved views is an explicit recovery action.
Grid callbacks and density callbacks are application code: if one throws after
accepting state, the controller reports the failure but cannot roll back arbitrary
application side effects. Keep those callbacks predictable.

Run `/filtering` in all three basic examples. `?remote=1` uses an explicitly
in-memory delayed candidate adapter to reproduce request races and retry; it is
not production server evidence. The examples also expose blocked-storage and
recovery controls. Automated three-engine checks cover nested conditions,
precision, dates/booleans, invalid input, saved query/layout reload, facets,
storage failure, obsolete candidates, keyboard focus and axe. Actual assistive
technology acceptance remains part of the final quality milestone.
