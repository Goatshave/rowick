# Feature and configuration boundaries

Core owns row/column identity, state, the row pipeline and shared interaction
contracts. It imports no framework runtime, DOM helper, transport, database,
spreadsheet writer or application authentication. Adapters own framework
subscription/lifecycle behavior. Renderers own DOM and interaction presentation.
Themes and virtualization remain independent packages.

The new `@rowick/data` package is optional. Transactions prepare validated data
proposals; they do not turn the core into an authoritative server or mutate a
framework product's data props. It depends on core; core and adapters do not depend
on it. UI package manifests include data for their optional feature entries, while
their base renderer import graphs remain independent. Installing a UI package
therefore installs the feature dependency, but runtime bundling follows selected
entry points. Maintained feature routes load their example code lazily. Editor,
datasource, layout and exporter modules preserve these ownership and import
boundaries; XLSX stays in a separate package.

Public entry points are declared by package `exports` and tracked in
`api-contract/exports.json` and declaration snapshots. Internal file imports are
unsupported. Changes require updated declarations, external tarball consumption,
tests, migration guidance and changelog entries. New packages use the fixed
workspace version and MIT license; development manifests are not proof of npm
publication. The `@rowick/*` namespace has not been published yet.

## Saved configuration

Existing layout preferences remain schema version 1, independently of npm package
versions. [Preferences](preferences.md) include only the whitelisted layout and
density fields, normalize IDs against the current schema, preserve at least one
visible column and reject unsupported future versions. Unknown/malformed input
does not become executable code. Migrations must be explicit, unambiguous and
advance to the supported schema; failing migrations return no restored state.

Do not persist the entire `Grid`, raw row models, callbacks, pending operations,
prepared transaction source references or editor DOM state. Products choose which
selection/query/column identifiers may be stored and their retention policy.
New advanced filter/view/pivot formats need their own version and validated
migration before they enter saved layouts. An npm minor update does not by itself
change a saved-data schema version.

## Distribution

Core and data entries use tsup/esbuild minification and separate source maps.
The source and map remain available in the package's `dist` files. Optional
features use separate entry points, so application bundling follows the selected
imports and their dependencies.

Public declarations also follow relative shared/Svelte type dependencies, so
moving a prop or interface into a type chunk does not hide an API change from
review. External staged-package checks verify imports, source maps, strict types,
framework compatibility and optional feature consumption. The independent XLSX
reader is a development check; its version and transitive dependency are
hash-pinned in CI and are not installed by consumers of the grid.
