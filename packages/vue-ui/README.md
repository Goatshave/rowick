# @rowick/vue-ui

Optional styled Vue data grid for Rowick.

Use this package for the reference Vue grid UI, including sorting, filtering, selection, editing, grouping, tree data, virtualization, and export helpers.

`DataGrid` accepts `ariaLabel` for a product-specific accessible name and defaults to `"Data grid"`.

Use Vue's `class` attribute, `getRowClassName(row)`, `getHeaderClassName(context)`, and `getCellClassName(context)` to attach product-owned root, row, header, and cell classes for status, risk, or workflow styling without replacing the renderer. Header contexts include the grid, column, and header; cell contexts also include the row and current value.

Use `renderHeader` and `renderCell` for framework-native VNodes, `renderToolbar` for
product commands, and the state render callbacks for component-based loading,
error, and empty content. See the
[custom rendering](https://github.com/Goatshave/rowick/blob/main/docs/custom-rendering.md) and
[composition](https://github.com/Goatshave/rowick/blob/main/docs/composition.md) guides.

## Install

```bash
npm install @rowick/vue-ui @rowick/theme vue
```

## Usage

```ts
import "@rowick/theme/css";
import "@rowick/vue-ui/css";
import { defineComponent, h } from "vue";
import { createColumnHelper, createDataGrid } from "@rowick/vue-ui";

const column = createColumnHelper<{ id: string; name: string }>();
const DataGrid = createDataGrid<{ id: string; name: string }>();

export default defineComponent({
  setup: () => () => h(DataGrid, {
    ariaLabel: "People",
    options: {
      data: [{ id: "1", name: "Mina" }],
      columns: [column.accessor("name", { header: "Name" })],
      getRowId: (row) => row.id,
    },
  }),
});
```

Override semantic `--rowick-*` variables on `[data-rowick]` to match a product design system. Set `data-rowick-theme="dark"` on the grid or an ancestor for the bundled dark defaults; application toolbars and surrounding panels remain product-owned.

Set `options.editHistoryLimit` to a positive number to opt into bounded edit
history. Outside an active editor, Ctrl/Meta+Z undoes and Ctrl/Meta+Shift+Z or
Ctrl+Y redoes direct edits, pastes, and fills through the same preventable
`onCellEdit` contract.

Use `onGridReady: (grid) => ...` to connect product-owned toolbar commands,
diagnostics, or subscriptions to the styled grid's live core API. The handler runs
after mount and may return a cleanup function; return the unsubscribe function from
`grid.subscribeSelector(...)` when product UI mirrors one derived API value without
reacting to unrelated grid notifications.

The package re-exports `fitColumnsToWidth(grid, width, { columnIds? })` for
proportional visible-column fitting with core-owned min/max redistribution. Products decide the
available width and command placement; the renderer does not read layout implicitly.

See the [Vue UI guide](https://github.com/Goatshave/rowick/blob/main/docs/vue-ui.md) for controlled state, virtualization, editing, grouping, accessibility, and server-owned workflows.

## Optional feature entries

Optional feature entries are `/editing`, `/filtering`, `/server-data`,
`/layout` and `/analytics`. Import their documented CSS explicitly when provided.
Their controllers come from matching `@rowick/data` entries; XLSX is a separate
optional exporter. Base rendering remains on the package root. See the
[feature guides](https://github.com/Goatshave/rowick/blob/main/docs/packages.md).
