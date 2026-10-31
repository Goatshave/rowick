# Pivot, typed files and export jobs

The `/analytics` entries and `@rowick/export-xlsx` are part of the unpublished
Rowick 0.1.0 candidate.

## Client pivot and saved configuration

```ts
import { createPivot, serializePivotConfiguration } from "@rowick/data/analytics";

const fields = [
  { id: "region", label: "Region", getValue: (row) => row.region },
  { id: "quarter", label: "Quarter", getValue: (row) => row.quarter },
  { id: "amount", label: "Amount", getValue: (row) => row.amount },
];
const configuration = {
  version: 1,
  rowAxes: ["region"], columnAxes: ["quarter"],
  metrics: [{ id: "sales", label: "Sales", columnId: "amount", operation: "sum" }],
  subtotals: true, rowTotals: true,
};
const result = createPivot(filteredRows, fields, configuration);
const saved = serializePivotConfiguration(result.configuration, fields);
```

Supply the product's filtered rows; this helper does not silently change grid
filters or fetch remote data. Axis values are finite JSON scalars. Missing values
normalize to null, while `1`, `"1"`, `true` and `"true"` retain distinct identities.
Dates/objects need an explicit scalar accessor. Axis sorting is deterministic and
locale independent. Hierarchical children stay with their parent; subtotals follow
the parent's descendants. Dynamic column IDs encode the full typed tuple and
metric ID, rather than joining ambiguous delimiter strings.

Metrics include `sum`, `avg`, `min`, `max`, `count` and `distinct-count`. Count counts
records, including records with a missing metric; other metrics skip null.
Distinct count preserves scalar types. Numeric aggregates require finite binary64
numbers and never coerce a numeric-looking string. The compensated sum still has
binary64 limits; it is not an exact decimal accounting engine. Exact financial
calculations can be supplied as preaggregated server values with explicit schema.
Do not turn precise decimal strings into `Number` merely to feed a pivot.

The result includes data rows, optional prefix subtotals, a grand total and
optional total columns across all column buckets. Numeric overflow throws.
Empty input produces a grand total with count zero and empty numeric aggregates.
No input records are retained in the result.

Default limits are 100,000 input records, 10,000 output rows, 200 output columns,
one million accumulator/output cells, 20,000 groups, 10,000 distinct values per
cell, 100,000 distinct entries across cells and eight million retained key
characters. Axes are at most eight fields each and metrics at most sixteen.
Finite configuration limits can be raised explicitly within validated bounds;
overflow fails the entire calculation, without a partially applied result. Use
database/server aggregation for a dataset beyond these client limits.

Configuration version 1 stores axes, metrics, subtotals/totals and sort rules.
`parsePivotConfiguration` checks the current field schema, operators, duplicate
IDs, sparse arrays and payload size. Unknown versions/removed fields fail rather
than restoring a different analysis. This pivot document is separate from layout
preferences version 1; it contains no source rows or functions.

## Shared controller and basic UI

```ts
import { createAnalyticsController } from "@rowick/data/analytics";
import { createXlsxExporter } from "@rowick/export-xlsx";

const analytics = createAnalyticsController({
  fields, getRows: () => filteredRows, configuration,
  getRevision: () => productDataAndPermissionRevision,
  exporters: { xlsx: createXlsxExporter({ filename: "sales" }) },
  loadView: () => storage.getItem("sales-pivot"),
  saveView: (value) => storage.setItem("sales-pivot", value),
  onArtifact: (file) => downloadBytes(file),
});
```

The product supplies the named data, storage, permission revision and download
functions. Storage is optional; without callbacks the controller keeps one view
in memory. Draft settings do not change the applied result until `apply`. Failed
schema/size calculations preserve the last successful result. Save operates on
an applied view. Restore validates and computes a complete candidate before
changing state; malformed configuration and storage exceptions are visible.

Optional panels use the same controller:

```tsx
import { AnalyticsPanel } from "@rowick/react-ui/analytics";
import "@rowick/react-ui/analytics.css";
<AnalyticsPanel controller={analytics} />;
```

```ts
import { createAnalyticsPanel } from "@rowick/vue-ui/analytics";
import "@rowick/vue-ui/analytics.css";
const Panel = createAnalyticsPanel<Sale>();
// h(Panel, { controller: analytics })
```

```svelte
<script>
  import { AnalyticsPanel } from "@rowick/svelte-ui/analytics";
  import "@rowick/svelte-ui/analytics.css";
</script>
<AnalyticsPanel controller={analytics} />
```

The panels expose native keyboard controls and axis-priority move buttons for axes, metrics, subtotals, sorting,
apply/reset, saved views and export scope. Buttons and formatters accept translated
`labels`. Source refreshes preserve unapplied draft settings. The preview pages rows **and columns**, defaulting to at most 50 × 12
data cells per page; it does not mount every pivot cell. Limits can be configured
to 100 rows/50 columns per preview page, and the panel supports at most 500 field
definitions. Export uses the entire applied result, independently of preview
pages. For a virtualized or custom analysis design, consume the headless result.

Create the controller in product lifecycle code and dispose it on teardown.
Panels own only their subscriptions. React effects/external data owners avoid
creating subscriptions during abandoned renders. Vue/Svelte subscribe on mount,
so SSR does not create a component subscription. Svelte 4/5 use the same entry.

## Export documents, policy and cancellation

```ts
import { createAnalyticsExportJob, createDelimitedExporter } from "@rowick/data/analytics";

const job = createAnalyticsExportJob({
  rows: filteredRows, // Iterable or AsyncIterable; a stream need not be materialized.
  columns: [
    { id: "name", label: "Name", getValue: (row) => row.name },
    { id: "amount", label: "Amount", type: "number", format: "#,##0.00", getValue: (row) => row.amount },
    { id: "exact", label: "Exact amount", type: "decimal", getValue: (row) => row.exactAmount },
    { id: "secret", label: "Secret", sensitive: true, getValue: (row) => row.secret },
  ],
  scope: "filtered", totalRows: filteredRows.length,
  revision: productRevision, getCurrentRevision: () => productRevision,
}, { exporter: createDelimitedExporter(), maxRows: 100_000 });
const stop = job.subscribe(() => updateProgress(job.getState()));
const artifact = await job.start();
// job.cancel() aborts waiting/encoding; dispose() releases source/subscriptions.
stop(); job.dispose();
```

Scopes `all`, `filtered`, `page`, `selection` and `pivot` describe the actual source
supplied by the data owner. A loaded page never implicitly stands for all remote
matches. Source arrays/records must be immutable. Supply a revision covering both
data and permission/query changes when a job must reject a stale snapshot.

Sensitive columns are excluded before their value getter runs. Including one
requires both `includeSensitive: true` and a positive `authorizeColumn` result.
`exportable: false` always excludes a column. Authorization is checked again while
collecting and before encoding. A denied row aborts the file rather than silently
producing a misleading partial result. The backend must enforce the same policy;
client flags are not an authorization boundary.

Default job caps are 100,000 data rows, 1,000 columns, one million header+data cells,
16 million text characters and 64 million artifact bytes. Text cells have a
32,767-character cap and must be valid XML text. Custom limits remain bounded.
Collection and built-in encoders yield periodically, exposing collecting/encoding
progress, cancellation and errors. Cancelling also stops waiting on a provider
that ignores abort; it cannot force that provider's external work to stop. Pass
the signal to fetch/database work and close the iterator when cancelled.

`start()` deduplicates a job. An active controller export blocks another one.
Applying a new pivot cancels/releases its old job; older completion/error callbacks
cannot replace the newer result. Jobs compare the supplied source revision and
reject drift. Each row is checked before output, and an encoding failure returns
no downloadable artifact. Product artifact/download callbacks run after success.

CSV/TSV protects formula-like text by default and escapes delimiters, quotes and
line breaks. Numeric negatives remain numeric. CSV/TSV carries no type metadata;
spreadsheet import defaults can reinterpret IDs/dates. Use XLSX when preserving
those types matters. `protectFormulaText: false` is an explicit product policy
override for text formats, not a default for untrusted data.

## Typed XLSX

`@rowick/export-xlsx` adds no third-party runtime library and remains outside
the default core/UI entries. It emits a real OOXML workbook in a ZIP store archive
with CRC32, UTF-8 flags, central directory/EOCD and ZIP32 limits. Store mode makes
files larger than compression; the default 64 MB XML/ZIP budget is explicit.

Numbers/booleans remain typed. Exact decimal strings and IDs remain shared strings;
Excel cannot round them or drop leading zeros. Number formats are retained for
numeric cells. Decimal strings remain text rather than pretending to be formatted
numeric cells. Formula-like strings remain shared strings, with no formula XML.
The writer emits no hyperlinks, macros, embedded objects or external relations.
Literal `_xHHHH_` strings, carriage returns, Unicode and XML-sensitive text are
escaped according to the format's rules.

Date cells accept valid calendar strings from 1900 through 9999. Datetimes require
an explicit UTC ISO timestamp; the job also accepts `Date` only for a declared
datetime column and serializes its UTC instant. No locale/date/timezone inference
is performed. Earlier dates can be exported as explicit text. The workbook uses
the 1900 date system and leaves serial 60 unused for Excel's nonexistent
1900-02-29. Numeric/date formats, grouped headers and frozen headers are included.

Columns can provide `headers: ["Sales", "Amount"]` for grouped header rows. Merges
use zero-based coordinates across headers plus data. `resolveExportMerges` maps
stable row/column ID spans into the exact exported order and rejects partial or
reordered merges. Hidden covered values are masked before a custom/CSV exporter
receives the document, and XLSX/print suppress covered cells. A scope that splits
a merge requires an explicit product decision rather than silently changing it.

Independent verification uses Python's `zipfile` (CRC/parts) and `openpyxl` 3.1.5
(cell values/types, formats, dates, Korean, merged headers and freeze panes):

```sh
python3 -m pip install -r packages/export-xlsx/test/requirements.txt
pnpm --filter @rowick/export-xlsx test:independent
```

Use `ROWICK_XLSX_READER_PYTHON` to choose a Python environment. Setting
`ROWICK_XLSX_REFERENCE_PATH=/tmp/rowick-reference.xlsx` also saves the fixture
for manual review. **Actual Excel/Numbers opening is still a pending release gate**;
automated ZIP/reader success is not recorded as manual spreadsheet acceptance.

Implementation references are [ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/),
Microsoft's [cell representation](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cell),
[escaped string rules](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/bd0aa042-434a-4ca7-b25f-4e1fd25a954d)
and [1900 leap-day compatibility](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year).

## Server processing and custom exporters

`createServerAnalyticsExportRequest` captures immutable query identity, explicit
IDs or all-matching exclusions, approved column IDs, format and a row cap. It
rejects a selection from another query. Treat this as an untrusted DTO on arrival.
The server must resolve current rows, deleted IDs, live-query membership, final
permissions and its own output limits.

`createServerAnalyticsExportHandler` provides a Fetch `Request`/`Response` endpoint
that works with Next.js, Nuxt and SvelteKit route adapters. Supply **server-owned**
`authorize`, `authorizeRow`, `authorizeColumn`, `validateQuery`, `getQueryKey`,
`getRows` and `getRowId` callbacks. The provider receives the captured selection
to push inclusion/exclusion predicates into parameterized database queries. Never
concatenate user columns, operators or values into SQL. Use a transaction/snapshot
or combined revision when data/permissions can change during serialization.

The handler bounds JSON input, validates the query key/selection/allowed columns,
reauthorizes while collecting, handles deleted IDs, rejects duplicate server row
IDs, caps scans, and returns a private/no-store attachment. Empty explicit
selection does not read source rows. It does not supply a login/session system,
database driver or background job service. The example's public local key is a
synthetic demonstration credential, not production authentication.

For very large datasets, stream a bounded server export or use the product's
background export/download service; do not load millions of rows into a browser
to call a client pivot. A request exceeding output/scan/byte limits fails clearly.
The `/analytics` examples include a same-origin HTTP XLSX endpoint and a server
export action for the explicit **Filtered records** scope. Their tiny client
fixture demonstrates the wire path; production remote exports should send the
captured request directly, without collecting unloaded records on the client.

A custom `AnalyticsExporter` receives the immutable, policy-filtered document,
an abort signal and a progress reporter and returns `{ filename, mimeType, bytes }`.
The example's JSON exporter demonstrates this extension. It also includes delayed
and failing exporters for cancellation/recovery checks. `createPrintExporter`
returns a standalone escaped HTML document with repeating headers, merged cells,
page margins/orientation and print CSS. Open that artifact and print through the
browser; the library does not open unsolicited windows or invoke a print dialog.
