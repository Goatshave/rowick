---
title: Sorting
outline: [2, 3]
pageClass: feature-example
sidebar: false
aside: false
---

# Sorting

Sort one column or apply ordered rules to several columns.

<ClientOnly><FeatureDemo key="sorting" feature="sorting" /></ClientOnly>

## Try it

Click **Highest score first**, then **Team, then score**. Watch the row order and
`sorting` state change together. Column headers also toggle sorting.

The first rule has priority; the second resolves ties within the first.

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

`setSorting([])` restores source order. Stable row IDs keep identity independent
of display order. For remote data, enable `manualSorting` and send the sort rules
to your server instead of sorting only the loaded page.

Read the [state lifecycle guide](../state-lifecycle.md) for the full contract.
