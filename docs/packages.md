# Packages

Rowick prepares twelve public packages for its first `0.1.0` release. They use one
fixed release version and have not been published under `@rowick` yet. Start with
a maintained UI package unless your product needs to own the entire renderer.

The 0.1 framework contract supports React 18.2 through 19, Vue 3.4 and later
Vue 3 releases, and Svelte 4.2.20 through 5. All packages are ESM and
TypeScript-first; the framework-independent packages also work in modern
JavaScript projects.

<a id="core"></a>
## `@rowick/core`

Framework-agnostic grid state, typed columns, row models, sorting, filtering, grouping, tree data, pagination with server-owned totals, selection, editing, export, and keyed server-request lifecycle contracts. See the [server data guide](./server-data.md).

<a id="data"></a>
## `@rowick/data`

Optional [row transactions](transactions.md), [row/batch editing](row-editing.md),
[advanced filters/facets/saved views](filtering.md), [server datasource](datasource.md),
[advanced layout/ranges](layout.md), [pivot/export](analytics-export.md), and
[locale codecs](localization.md). The root import contains transactions; features
have separate `/editing`, `/filtering`, `/server-data`, `/layout`, `/analytics`,
and `/locale` entry points. Products own authoritative data, transport and permissions.
This package is part of the first Rowick release candidate.

<a id="export-xlsx"></a>
## `@rowick/export-xlsx`

Optional typed XLSX writer with no third-party runtime dependency. It consumes
the analytics export contract, preserving explicit cell types, formats, Unicode
and verified merge ranges. The base grid does not import it. ZIP integrity and
values/formats are checked with an independent spreadsheet reader. See
[analytics and export](analytics-export.md). This package is not yet published.

<a id="react"></a>
## `@rowick/react`

Thin React adapter for controlled and uncontrolled core state. Pair it with `@rowick/primitives` for custom rendering.

<a id="react-ui"></a>
## `@rowick/react-ui`

Maintained styled React renderer. See the [React UI guide](./react-ui.md).
Development features also expose `/editing`, `/filtering`, `/server-data`,
`/layout`, `/analytics` and their documented optional CSS entries.

<a id="vue"></a>
## `@rowick/vue`

Vue adapter exposing the shared core through reactive framework contracts.

<a id="vue-ui"></a>
## `@rowick/vue-ui`

Maintained styled Vue renderer. See the [Vue UI guide](./vue-ui.md).
The same optional development feature entries are available as the React UI.

<a id="svelte"></a>
## `@rowick/svelte`

Svelte store adapter for the shared framework-agnostic engine.

<a id="svelte-ui"></a>
## `@rowick/svelte-ui`

Maintained styled Svelte renderer. See the [Svelte UI guide](./svelte-ui.md).
The same optional development feature entries retain Svelte 4/5 component contracts.

<a id="virtual"></a>
## `@rowick/virtual`

Framework-independent row and column virtualization calculations and measurement caches.

<a id="primitives"></a>
## `@rowick/primitives`

Unstyled DOM props, interaction guards, layout helpers, and renderer-shared accessibility contracts.

<a id="theme"></a>
## `@rowick/theme`

Default CSS theme, CSS custom properties, and typed light/dark product token adapters.
