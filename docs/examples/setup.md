---
title: Example setup
outline: [2, 3]
pageClass: feature-example
---

# Shared example setup

The feature examples use the same eight fictional people so each page can focus
on a single grid behavior. All changes stay in page memory. Reset restores the
original data; reloading clears changes.

## Data

<<< ../../website/.vitepress/theme/examples/people.ts#data

## Connect a grid

Install your framework’s maintained UI package and import its styles. This is a
minimal Vue setup; pass the ready grid instance to the functions on each example
page. The previews use the published `0.1.0` core and matching UI package for the
selected framework.

```vue
<script setup lang="ts">
import { ref, shallowRef } from "vue";
import { createDataGrid, createColumnHelper, type Grid } from "@rowick/vue-ui";
import "@rowick/theme/css";
import "@rowick/vue-ui/css";

type Person = { id: string; name: string; team: string; status: string; score: number };
const rows = ref<Person[]>([
  { id: "p1", name: "Mina Park", team: "Design", status: "Active", score: 82 },
  { id: "p2", name: "Alex Chen", team: "Engineering", status: "Active", score: 95 },
]);
const column = createColumnHelper<Person>();
const columns = [
  column.accessor("id", { header: "ID" }),
  column.accessor("name", { header: "Name" }),
  column.accessor("team", { header: "Team" }),
  column.accessor("status", { header: "Status" }),
  column.accessor("score", { header: "Score" }),
];
const DataGrid = createDataGrid<Person>();
const grid = shallowRef<Grid<Person> | null>(null);
function ready(instance: Grid<Person>) {
  grid.value = instance;
  return () => { if (grid.value === instance) grid.value = null; };
}
</script>

<template>
  <button @click="grid?.setSorting([{ id: 'score', desc: true }])">Sort by score</button>
  <DataGrid
    :options="{ data: rows, columns, getRowId: row => row.id }"
    :on-grid-ready="ready"
    aria-label="People"
  />
</template>
```

## Frameworks

The `Grid` methods and state shapes used in the examples are shared across
frameworks. Rendering, event handlers and data ownership follow each framework’s
lifecycle. Use the complete [React](../react-ui.md), [Vue](../vue-ui.md) or
[Svelte](../svelte-ui.md) guide for that wiring.

The live previews and source tabs are built from the same example templates.
The shared model and editing rules live in
`website/.vitepress/theme/examples/`; framework templates live in its
`templates/` directory. The build formats each project before both compiling
it and exposing its files in the source viewer.
