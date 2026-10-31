# @rowick/react

React adapter for Rowick.

Use this package when you want React bindings for the framework-agnostic core without the optional styled UI.

## Install

```bash
npm install @rowick/react react
```

## Usage

```tsx
import { createColumnHelper, useGrid, useGridSelector } from "@rowick/react";

const column = createColumnHelper<{ id: string; name: string }>();

function PeopleModel({ data }: { data: Array<{ id: string; name: string }> }) {
  const grid = useGrid({
    data,
    columns: [column.accessor("name", { header: "Name" })],
    getRowId: (row) => row.id,
  });
  const selectedRowCount = useGridSelector(
    grid,
    (currentGrid) => Object.keys(currentGrid.getState().rowSelection).length,
  );

  return <>{grid.getRowModel().rows.length} rows, {selectedRowCount} selected</>;
}
```

`useGridSelector` subscribes through the core selector contract and rerenders only
when the selected value changes. Pass a custom equality function as the third
argument when a selector returns a derived object.

Use [`@rowick/react-ui`](https://www.npmjs.com/package/@rowick/react-ui) when you want the maintained styled grid instead of a custom renderer.
