---
title: Filtering
outline: [2, 3]
pageClass: feature-example
sidebar: false
aside: false
---

# Filtering

Combine global search, an exact team filter and a numeric range.

<ClientOnly><FeatureDemo key="filtering" feature="filtering" /></ClientOnly>

## Try it

Choose **Design**, then enter **80** as the minimum score. The result contains
Mina Park and Emma Wilson. Add **Emma** to Search to narrow the result to one row.

Conditions on different columns combine with AND. The team set matches exact
values; the numeric range includes its lower bound.

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

An empty control removes its condition. Query setters reset pagination to the
first page. Use typed set/range values when substring matching would be ambiguous.
This example filters local data; remote adapters must apply the same query on
the server.

Read the [filters guide](../filters.md) for the full contract.
