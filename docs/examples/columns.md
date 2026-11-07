---
title: Column visibility & pinning
outline: [2, 3]
pageClass: feature-example
sidebar: false
aside: false
---

# Column visibility & pinning

Toggle a column and pin Name to the left edge.

<ClientOnly><FeatureDemo key="columns" feature="columns" /></ClientOnly>

## Try it

Uncheck **Show score** to remove the Score column. Enable **Pin name to left**
to move Name into the pinned region. On a narrow viewport, scroll the grid
horizontally and the pinned column stays visible.

Expand **Inspect grid state** in the preview to compare visibility and pinning.

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

Visibility is keyed by column ID. Pinning describes left/right regions and
is independent of source column order. Use stable column IDs when saving layout
preferences across sessions.

Read the [layout guide](../layout.md) for the full contract.
