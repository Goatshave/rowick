# @rowick/svelte

Svelte adapter for Rowick.

Use this package when you want Svelte bindings for the framework-agnostic core without the optional styled UI.

## Install

```bash
npm install @rowick/svelte svelte
```

## Usage

```ts
import { createColumnHelper, createGridSelectorStore, createGridStore } from "@rowick/svelte";

const column = createColumnHelper<{ id: string; name: string }>();
const { grid, state, setOptions, dispose } = createGridStore({
  data: [{ id: "1", name: "Mina" }],
  columns: [column.accessor("name", { header: "Name" })],
  getRowId: (row) => row.id,
});
const selectedRowCount = createGridSelectorStore(
  grid,
  (currentGrid) => Object.keys(currentGrid.getState().rowSelection).length,
);
```

`state` is a readable Svelte store. Call `dispose` when a store-backed options source is no longer used. Use [`@rowick/svelte-ui`](https://www.npmjs.com/package/@rowick/svelte-ui) for the maintained styled grid.

`createGridSelectorStore` starts the core selector subscription when the first
Svelte subscriber connects and removes it when the last subscriber leaves. It emits
only when the selected value changes.
