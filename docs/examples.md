---
title: Live example
outline: [2, 3]
---

# A grid you can work with

This example runs the published **`@rowick/vue-ui@0.1.0`** package. Sort column
headers, filter the projects, select rows, or double-click a project name to edit.
Press Enter to save an edit or Escape to cancel it.

<ClientOnly>
  <RowickDemo />
</ClientOnly>

Illustrative data is stored only in this page's memory. Reset the demo to restore
the original rows. It does not send edits to a server or save them between visits.

## Choose your framework

Each maintained UI uses the same grid engine. Start with your framework's guide
for a complete example, styles, controlled state, and editing integration.

| Framework | Package | Guide |
| --- | --- | --- |
| React | `@rowick/react-ui` | [React UI](react-ui.md) |
| Vue | `@rowick/vue-ui` | [Vue UI](vue-ui.md) |
| Svelte | `@rowick/svelte-ui` | [Svelte UI](svelte-ui.md) |

## Add a typed grid

::: code-group

```tsx [React]
import "@rowick/theme/css";
import "@rowick/react-ui/css";
import { createColumnHelper, DataGrid } from "@rowick/react-ui";

type Person = { id: string; name: string; team: string };
const column = createColumnHelper<Person>();
const columns = [
  column.accessor("name", { header: "Name" }),
  column.accessor("team", { header: "Team" }),
];
const data: Person[] = [{ id: "p1", name: "Mina", team: "Design" }];

export function PeopleGrid() {
  return <DataGrid data={data} columns={columns} getRowId={(row) => row.id} />;
}
```

```vue [Vue]
<script setup lang="ts">
import "@rowick/theme/css";
import "@rowick/vue-ui/css";
import { createColumnHelper, createDataGrid } from "@rowick/vue-ui";

type Person = { id: string; name: string; team: string };
const column = createColumnHelper<Person>();
const DataGrid = createDataGrid<Person>();
const options = {
  data: [{ id: "p1", name: "Mina", team: "Design" }],
  columns: [
    column.accessor("name", { header: "Name" }),
    column.accessor("team", { header: "Team" }),
  ],
  getRowId: (row: Person) => row.id,
};
</script>

<template>
  <DataGrid :options="options" />
</template>
```

```svelte [Svelte]
<script lang="ts">
  import "@rowick/theme/css";
  import "@rowick/svelte-ui/css";
  import { createColumnHelper, DataGrid } from "@rowick/svelte-ui";

  type Person = { id: string; name: string; team: string };
  const column = createColumnHelper<Person>();
  const data: Person[] = [{ id: "p1", name: "Mina", team: "Design" }];
  const columns = [
    column.accessor("name", { header: "Name" }),
    column.accessor("team", { header: "Team" }),
  ];
</script>

<DataGrid options={{ data, columns, getRowId: (row) => row.id }} />
```

:::

## Explore more

- [Filters and typed conditions](filters.md)
- [Row editing, validation and save flows](row-editing.md)
- [Server totals, cancellation and retry](server-data.md)
- [Pivot tables and typed XLSX export](analytics-export.md)
- [Layout, cell ranges and clipboard](layout.md)

The repository's framework examples include these optional features. Follow the
[local example instructions](https://github.com/Goatshave/rowick#try-the-examples)
to run them. Server examples need their local service; this static documentation
site does not host an API.

See the [initial release validation scope](initial-release-validation.md) for
platform and assistive-technology checks deferred in 0.1.0.
