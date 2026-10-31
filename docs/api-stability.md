# API stability

Rowick is currently pre-1.0. Public APIs can evolve, but published applications
must not be surprised by unreviewed declaration changes.

## Public surface

The public surface is the set of entry points declared by each package's `exports`
map. Source files, examples, development tooling, and paths not present in an exports
map are internal and may change without a compatibility notice.

`pnpm api:check` compares every package export with `api-contract/exports.json` and
the built declarations for every typed entry point with the reviewed declaration
files in `api-contract/`. Relative declaration dependencies are followed too,
including shared type chunks and Svelte component prop declarations. Removed
exports, including CSS entry points, and stale declaration snapshots fail the
check. An intentional public change requires
`pnpm api:update`, tests for the new behavior, relevant guide updates, and an
`Unreleased` changelog entry.

## Row IDs and row-model dictionaries

Row IDs are string keys, including names such as `__proto__`, `constructor`,
`toString`, and `hasOwnProperty`. Supply unique, stable IDs through `getRowId` when
product data can be reordered, inserted, removed, or loaded from a server. The
position-based fallback is available. Rowick validates IDs when a new
column/core row model is calculated.

`RowModel.rowsById` is a `Record<RowId, Row<TData>>` with a null prototype. Every indexed row is an enumerable own property; absent IDs return
`undefined`, including names that otherwise come from `Object.prototype`. Lazy
indexes remain cached. Do not call methods such as `rowsById.hasOwnProperty(...)`
or `rowsById.toString()`; those names may be row IDs. Use bracket access,
`Object.hasOwn(rowsById, id)`, and `Object.keys/values/entries(rowsById)` instead.

Selection and expansion records retain their ordinary object representation.
Only own boolean flags affect the grid; inherited flags are ignored. To construct
flags for arbitrary IDs, use computed keys (`{ [rowId]: true }`) or
`Object.fromEntries(...)` instead of an object-literal `__proto__` setter.

JSON projection retains enumerable ID keys. Raw row models can contain cyclic
`leafRows` references, so project them into product data/metadata before JSON
serialization. Raw row models are not JSON payloads.

### ID validation

IDs must be non-empty strings. No trimming, string coercion, or automatic UUIDs
are applied. Whitespace and Unicode remain opaque valid IDs. Row IDs must be
unique across the entire loaded tree, including different parents' children.
Column IDs must be unique across all group and leaf definitions, including hidden
columns. An explicit column `id` takes precedence over `accessorKey`; definitions
without either use the positional fallback. Invalid explicit values
throw rather than falling back. Repeated accessors need distinct IDs:

```ts
const columns = [
  { id: "amount:raw", accessorKey: "amount" },
  { id: "amount:formatted", accessorKey: "amount", cell: formatAmount },
];
const getRowId = (row) => row.recordId;
// Child IDs that are only unique within a parent need a stable product namespace.
const getTreeRowId = (row, _index, parent) =>
  JSON.stringify(parent ? [parent.id, row.localId] : [row.localId]);
```

The `__group__` prefix is reserved for internal group/footer row IDs and is
rejected for product rows, even while grouping is inactive. Group ID segments
escape `%`, `>` and `:`. Non-string grouping keys include a type tag, so numeric
`1`, string `"1"`, null, undefined, non-finite numbers, and dates cannot alias one
another. String keys starting with `__value__` are escaped from this internal
type namespace. Treat group IDs as opaque values rather than constructing them.
Object grouping uses JSON-value semantics; use a scalar `groupingValue` when a
product needs a specific stable key.

Invalid/duplicate IDs throw a `TypeError` on model calculation in all builds.
Errors identify input positions in preorder traversal (parents before children)
and omit IDs, values, and original rows. Duplicate errors identify both positions.
Validation preserves lazy model/index creation and cached reuse. A `getRowId`
callback runs once per row per new core model. Replace data/column arrays
immutably so dependency changes trigger validation; in-place mutation remains
unsupported. A failed computation does not replace a successful cached model;
supply corrected options and read again to recover. `setOptions` does not promise
eager validation or automatic rollback of the supplied options.

Active coordinate reconciliation can require validation during replacement and
then reject an invalid replacement atomically. See [data/state ownership](state-lifecycle.md)
for this conditional path, controlled proposals, deferred callbacks, and cleanup.

Validation covers currently loaded data, including collapsed/filtered-out rows.
It does not retain a global registry of server pages. The server must guarantee
stable unique IDs across its full dataset. Positional fallback identifies
positions: selecting position `0` then reordering data selects the new occupant
of position `0`. Supply `getRowId` for reorder/insert/delete/server workflows.
Selection of off-page IDs is retained until the product explicitly prunes it.

## Version policy

- Versions below 1.0 are usable public releases, not automatically alpha software.
  The minor number is the compatibility boundary for documented breaking changes.
- Patch releases such as `0.1.1` contain compatible fixes. They do not remove public
  exports or make accepted inputs narrower.
- Minor releases such as `0.2.0` may add APIs. A necessary breaking change must be
  called out in the changelog and include a migration example.
- Prereleases use `alpha.N`, `beta.N`, or `rc.N` and npm dist-tag `next`. Alpha means
  the release scope is incomplete, beta means feature work is complete and integration
  feedback is still expected, and release candidate means only release-blocking fixes
  are expected before the corresponding stable version.
- Stable releases omit the prerelease suffix and are published with npm dist-tag
  `latest`. A prerelease is never published under `latest`.
- All packages use one fixed workspace version so consumers can keep adapter,
  renderer, core, primitive, virtual, theme, and optional feature packages aligned.
  The initial `0.1.0` candidate includes twelve public packages, including the
  optional `@rowick/data` and `@rowick/export-xlsx` packages. Publication is pending.

## Deprecation policy

When practical, an API is marked deprecated for at least one minor release before
removal. The declaration includes `@deprecated` guidance and the documentation shows
the replacement. Immediate removal is reserved for security, data integrity, or an
API that cannot work as documented; such exceptions require explicit release notes.

Before 1.0, a minor release is still the boundary for documented breaking changes.
After 1.0, Rowick will follow standard semantic versioning and reserve breaking
changes for major releases.
