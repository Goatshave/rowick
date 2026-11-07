---
title: Examples
outline: [2, 3]
pageClass: example-index
sidebar: false
aside: false
---

# Learn one feature at a time

Each example pairs an interactive grid with its implementation and the state it
produces. Choose a feature, try the controls, then use the code in your own grid.

<ClientOnly><ExampleCatalog /></ClientOnly>

## Further integration guides

These guides cover more involved integrations and link to the maintained
framework examples in the repository.

- [Server data, query state and remote selection](server-data.md)
- [Remote datasource, cancellation and recovery](datasource.md)
- [Row and batch save flows](row-editing.md)
- [Advanced filters and saved views](filtering.md)
- [Grouping, pivot and typed file exports](analytics-export.md)
- [Cell ranges and clipboard](layout.md)
- [Persisted preferences](preferences.md)

The repository’s server examples run with a local service. This static site does
not host a backend. See the [0.1.0 validation scope](initial-release-validation.md)
for platform checks deferred in the initial release.

The previews run the published `0.1.0` core and UI packages for the selected
React, Vue or Svelte framework. See [shared setup](examples/setup.md) for framework wiring.
