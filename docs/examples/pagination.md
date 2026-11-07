---
title: Pagination
outline: [2, 3]
pageClass: feature-example
sidebar: false
aside: false
---

# Pagination

Change page size and navigate through a local row model.

<ClientOnly><FeatureDemo key="pagination" feature="pagination" /></ClientOnly>

## Try it

Move to the next page, then choose **2** rows per page. Watch the zero-based
`pageIndex`, `pageSize` and page count. The buttons disable at either boundary.

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

This example has all eight rows in memory. For server pagination, use
`manualPagination` and supply totals or previous/next availability. Sorting or
filtering a query normally resets its page index.

Read the [server data guide](../server-data.md) for the full contract.
