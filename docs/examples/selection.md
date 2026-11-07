---
title: Row selection
outline: [2, 3]
pageClass: feature-example
sidebar: false
aside: false
---

# Row selection

Select rows by stable ID, including across pages.

<ClientOnly><FeatureDemo key="selection" feature="selection" /></ClientOnly>

## Try it

Enable **Select current page**, then move to the next page. The four selected
row IDs stay selected, even though those rows are no longer displayed.
**Clear selection** removes the selection across pages.

Individual row checkboxes use `toggleRowSelected`. Selecting one row puts
**Select current page** into its mixed state. Page selection uses
`toggleAllPageRowsSelected` in every framework.

## Implementation

Open **Code**, choose **React**, **Vue** or **Svelte**, then select a file
from the file explorer. Start with `src/App.tsx`, `src/App.vue` or
`src/App.svelte`. Data, columns and styles live in separate files.

The framework selector switches both the live preview and its source files.
Each preview is built from the files shown in the code viewer. Install the
selected framework, its matching `@rowick/*-ui` package, and `@rowick/core`.
Svelte source targets Svelte 5. The included styles reproduce the preview’s grid theme.
See the [shared setup](setup.md) for framework integration details.

## Behavior and boundaries

`getSelectedRowModel()` returns loaded selected rows. Do not use it as a complete
server-wide selection payload when some records are unloaded. Choose an explicit
selection scope for remote queries and bulk actions.

Read the [server data guide](../server-data.md) for the full contract.
