# Advanced layout, ranges and clipboard

The optional `@rowick/data/layout` entry point owns layout state around an existing core grid and, optionally, a `RowEditingController`. The React, Vue and Svelte `/layout` entry points render that controller; import the matching `/layout.css` stylesheet. Core grids and ordinary DataGrid imports do not include this feature.

```tsx
const layout = createGridLayoutController(grid, {
  editing: rowEditor,
  getRowHeight: row => row.original.expanded ? 68 : 44,
  acceptReorder: data => grid.setOptions(previous => ({ ...previous, data })),
});
<LayoutGrid controller={layout} idPrefix="orders-layout" height={440}
  renderDetail={({row}) => <OrderDetails order={row.original} />} />
```

Use a stable, page-unique `idPrefix` for SSR and multiple instances. React can generate one with `useId`; Vue and Svelte require one. Vue's `createLayoutGrid<T>()` preserves application row types. Svelte provides typed `cell` and `detail` slots as well as the render callbacks. Detail renderers can contain inputs, links and buttons: their cursor, clipboard and keyboard behavior stays native. Create and dispose the external controller once per owner, independently of renderer mounting. Rendering does not take ownership of the editor or grid.

## Geometry and accessibility

The renderer uses a semantic HTML table with grid semantics, native `rowSpan`/`colSpan`, and omitted covered cells. Sticky rows and columns use physical top/bottom/left/right offsets. Variable-height rows and detail rows are measured with ResizeObserver and batched `measureMany`; observers, animation frames and window listeners are removed on unmount. Ordinary row policies are minimum estimates, while detail content can grow and shrink. The current viewport is bounded, with before/after spacer rows. A span crossing its boundary keeps its anchor mounted; connected span closure is bounded to 64 rows.

`view.rowCount` counts the current page's data and detail rows, including pinned rows once. `item.rowIndex` gives that layout's zero-based logical index: the table announces `rowCount + 1`, header index 1 and each body index `rowIndex + 2`. `recordCount` separately reports the full dataset size; `sourceRowIndex` is not an ARIA row index. The accessible grid name explicitly refers to the current page layout.

Set `direction` when creating the controller. It returns physical columns left to right, reversing logical order inside each pin region for RTL. The table stays `dir=ltr`; cell contents and its surrounding UI use the controller direction. Physical ArrowLeft/Right need no additional reversal. Home/End follow the controller's logical direction. Pin positions remain physical boundaries.

Merges are stable row/column ID rectangles, contiguous in the current physical layout. They cannot overlap, cross pin regions or cross detail rows vertically. Sorting, filtering or hiding part of a rectangle can invalidate it: errors stay visible with Clear merges, Unpin all and Collapse details recovery controls. Fully off-page or filtered-out rectangles are inactive. Limits include 128 spans, 4,096 merged cells, 64 rows/columns per span, default 200 rendered items, and default eight pinned records per side. Invalid combinations fail explicitly rather than silently changing the anchor or discarding content.

## Editing and input

Arrow keys, Home/End, Control/Command+Home/End and Page keys use roving cell focus. Shift extends a rectangle; Control/Command adds independent ranges. Mouse and pen can drag over cells to extend a range. Touch taps select while preserving native scrolling; use the toolbar to edit and commit/cancel, or keyboard controls to extend ranges. Pointer cancellation and release end range drags.

Enter, F2 or printable input starts editing. Enter commits; Tab commits and moves; Escape cancels. Parsing and validation come from core column policies, with the external row editor enforcing permissions and persistence. Invalid raw input remains in the editor with an associated error. Session tokens reject obsolete input and async callbacks; IME composition, key code 229 and native editor cursor movement are preserved. Fill, paste and cut become one row-editor history boundary, so Undo/Redo cover a batch. Cell commit creates a draft; use the row editor's save actions for persistence.

Row reordering requires stable IDs, a synchronous immutable `acceptReorder` data owner and an unsorted, unfiltered, flat client view without dirty/pending drafts. Server, grouping and tree views are rejected. Pinned rows must be unpinned first. Vertically merged rows move as a block. Drag handles have equivalent Move selected up/down toolbar actions and a visible explanation when unavailable.

Both imperative reorder endpoints must be in the current layout page. Off-page
rows are rejected before acceptance so a hidden merge cannot be split by a
page-local operation. Full-dataset reorder belongs to the authoritative data owner
and must preserve every configured merge and page boundary.

Finish or cancel inline cell editing before pin/detail/span structure changes or
reordering. The controller rejects these changes while a raw editor session is
active, preserving its input and native composition instead of remounting it.
Geometry measurements and in-place detail content resizing remain available.

## Clipboard and export

Native copy/cut writes plain TSV, escaped HTML tables and `application/x-rowick-ranges+json`. Validated raw multi-range metadata is retained in a bounded HTML attribute when browsers restrict custom MIME. Paste prefers explicit custom MIME, then this metadata, then TSV. HTML is never executed or parsed as active DOM. Formula-like strings are escaped for external spreadsheets while the custom range format preserves exact cell text. TSV supports quoted tabs, quotes and newlines. Malformed, cyclic, oversized and unsupported input fails before mutation. Default clipboard limits are 10,000 cells, one million text characters and 32 blocks; HTML output and input are both bounded to four million characters.

Read-only, covered and invalid paste destinations are reported as skipped; other valid cells are staged together. Cut requires every clear to be valid and clears only after required clipboard formats are accepted. Toolbar clipboard operations require rich clipboard permission; native shortcuts remain available if denied. Async clipboard reads/writes are fenced against semantic changes and disposal. Geometry-only measurements do not invalidate an operation.

The headless `cut(write)` callback is synchronous. Returning a Promise/thenable
rejects before any source clear; await an asynchronous write and revalidate the
selection/data snapshot first, as the UI interaction adapter does. Parser and
validator callbacks cannot replace schema, permissions or newer editing intent
while a prepared clipboard batch is committed. Ragged TSV is bounded after
rectangular padding as well as while reading its raw cells.

`getExportSnapshot({scope:'page'|'range', rangeIndex?, columnIds?, maxCells?})` captures typed projected values, physical IDs and merge anchors at an operation revision. Details are presentation-only. Multiple ranges require an explicit range index; partial merges reject. Sensitive or non-exportable columns are excluded by default and cannot be explicitly requested. Compose the snapshot with `resolveExportMerges` and analytics export jobs for CSV/XLSX; the UI package itself does not depend on an exporter. The example exports the first selected range explicitly and fences stale revisions. CSV does not represent native merges; XLSX does.

## Examples and verification

Visit `/layout` in all three basic UI examples (`?dir=rtl` for RTL). Each uses 10,000 records × 20 columns, variable row policies, interactive resizeable details, physical pinned columns, sample vertical/horizontal merges, immutable reorder acceptance, multi-range clipboard, typed row forms and selected/page exports. `?test=1` enables example-only controls for immutable source-update and renderer-remount regression tests; ordinary URLs and library modules expose no globals.

`e2e/layout.spec.ts` exercises all three renderers on Chromium, Firefox and WebKit. Automated accessibility checks complement semantic and keyboard assertions. Real screen-reader sessions, mobile native touch gestures, native OS clipboard interoperability, large-scale frame/heap measurements and opening exported workbooks in spreadsheet products remain separate release evidence; automated DOM tests do not establish those results.
