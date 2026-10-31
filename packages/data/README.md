# @rowick/data

Optional Rowick data operations. Transaction preparation is immutable and
returns a proposal; the product owns when its authoritative data changes.

When using a release containing this package:

```sh
npm install @rowick/data @rowick/core
```

```ts
import { prepareRowTransaction, commitRowTransaction } from "@rowick/data";

const proposal = prepareRowTransaction(grid, {
  add: [{ data: newRecord }],
  update: [{ id: recordId, data: updatedRecord }],
  remove: [removedRecordId],
});
commitRowTransaction(grid, proposal); // Imperative, headless data owner.
// React/Vue/Svelte products instead accept proposal.data in their own data state.
```

Stable `getRowId` is required. Tree structural changes additionally require a pure
`setSubRows(row, children)` writer. Preparation validates the complete candidate
before returning and never changes grid options or state. Commit rejects a stale
source data/schema/identity configuration. Remote writes, permission checks,
database transactions and server undo are product responsibilities.

This package is part of the unpublished Rowick 0.1.0 candidate. Its entries are:

| Entry | Purpose |
| --- | --- |
| `@rowick/data` | Immutable loaded-row transactions |
| `@rowick/data/editing` | Row/batch drafts, typed forms, async validation/save and history |
| `@rowick/data/filtering` | Advanced filters, bounded facets, settings and saved views |
| `@rowick/data/server-data` | Bounded remote blocks, live revisions, selection, operations and SSR hydration |
| `@rowick/data/layout` | Pinned/detail rows, spans, variable heights, ranges and clipboard |
| `@rowick/data/analytics` | Bounded pivots, CSV/TSV/print/custom/server export |
| `@rowick/data/locale` | Explicit exact-number, currency and calendar-date codecs |

Import the selected entry rather than internal files. Controllers have explicit
`dispose()` lifetimes; transport, authorization, authoritative data and safe SSR
serialization stay with the product. Runtime modules are minified with external
source maps. The separate `@rowick/export-xlsx` package supplies XLSX output.
See the [guides](https://github.com/Goatshave/rowick/blob/main/docs/packages.md#data) and
[feature boundaries](https://github.com/Goatshave/rowick/blob/main/docs/feature-boundaries.md).
