---
title: Cell editing
outline: [2, 3]
pageClass: feature-example
sidebar: false
aside: false
---

# Cell editing

Validate a cell and accept changes into application-owned data.

<ClientOnly><FeatureDemo key="editing" feature="editing" /></ClientOnly>

## Try it

Double-click a value or choose **Edit first row** to edit directly inside the cell.
Press **Enter** to save or **Escape** to cancel.
The inline editor uses **Tab** and **Shift+Tab** to save and move between
editable fields in every framework.

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

Name accepts text, Team and Status offer choices, and Score accepts numbers from 0 to 100.
ID is read-only. Enter or leaving the input saves a valid value; Escape cancels.
Tab and Shift+Tab save before moving between editable cells, including across
rows. Invalid values keep the editor open and block navigation until corrected
or cancelled. **Inspect saved data** shows accepted values.

Commit events can carry failed validation. Check `event.validation?.valid` before
accepting the value; a commit phase alone does not imply success. The application
replaces accepted data immutably.
Rowick does not persist the edit to a server. For asynchronous validation,
conflicts and row/batch saves, use the row editing controller.

Read the [row editing guide](../row-editing.md) for the full contract.
