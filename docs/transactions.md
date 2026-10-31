# Immutable row transactions

The optional `@rowick/data` package is part of the unpublished Rowick 0.1.0
candidate. It prepares add/update/remove operations as one
validated immutable data proposal. Importing core or a renderer does not import
this package. Core remains the owner of sorting, filtering, grouping, selection,
focus and row models; the product remains the owner of its authoritative data.

```ts
import { prepareRowTransaction, commitRowTransaction } from "@rowick/data";

const proposal = prepareRowTransaction(grid, {
  add: [{ data: { id: "new", amount: 100 }, index: 0 }],
  update: [{ id: "existing", data: { id: "existing", amount: 200 } }],
  remove: ["obsolete"],
});
commitRowTransaction(grid, proposal); // Imperative core data owner.
```

Preparation never mutates the grid, source arrays, or records. Stable `getRowId`
is required. All operations are validated together before returning: unknown or
repeated targets, overlapping changes, identity replacement, duplicate/invalid
candidate IDs, invalid insertion indices and child-writer failures reject the
entire proposal. Source IDs cannot be removed and reused by an addition in the
same batch; use update for an existing identity. Validation errors omit row data.
User callbacks must be pure; their own mutations/side effects cannot be undone.

Removal happens first, then updates, then additions in input order. Each insertion
index addresses the resulting sibling array at that point; omission appends.
Update replaces the row payload while preserving its logical ID. Existing row
references are retained where unchanged. An empty/no-op transaction keeps the
original root array. A proposal reports `addedIds`, `updatedIds`, `removedIds`
and `changed`. Removing a parent reports all removed descendant IDs in preorder.

## Framework data ownership

React/Vue/Svelte products accept `proposal.data` in their own state. Calling only
`grid.setOptions` while continuing to render older data props would restore the
older data on the next render. The maintained examples have a `/transactions`
route for all three frameworks demonstrating product-state acceptance, selection
preservation and recovery after a rejected duplicate ID.

Keep a source-reference/version check when accepting a proposal later. Preparation
is synchronous. `commitRowTransaction` compares data, columns, `getRowId`,
`getSubRows` and `getRowCanExpand` references and rejects a stale source before
changing the grid. Framework products should make an equivalent comparison with
their current data/identity inputs, then apply the data through their own setter.
Do not mutate inputs after preparing a transaction.

Once accepted, the normal pipeline recomputes against the new data. Valid
selection/coordinates follow IDs. Missing cell coordinates are reconciled; row
selection remains until explicitly pruned. Transactions do not create cell-edit
history entries. Undo across external/server data revisions requires the edit
history policy; a local transaction is not a server transaction or server undo.
Callback exceptions after state publication do not roll data back: see
[state ownership](state-lifecycle.md).

## Trees

Loaded trees additionally need an immutable child writer whenever a nested
payload or child membership changes. Parents for separate additions must already
exist in the source; a new parent can include an entire new subtree in its data.

```ts
const proposal = prepareRowTransaction(grid, {
  add: [{ parentId: "parent", data: newChild }],
  remove: ["old-child"],
}, { setSubRows: (parent, children) => ({ ...parent, children: [...children] }) });
```

Removing a parent and also targeting one of its descendants is rejected. Writers
must preserve the requested child structure; candidate validation detects dropped
children and changed retained IDs. `getSubRows` must be a pure finite hierarchy.
Cyclic input is rejected. No transport, authorization, database transaction,
revision conflict resolution, or implicit server-page mutation is performed.

## Cost

This implementation constructs an immutable candidate and validates its full
loaded tree. Preparation is O(n + operations), with temporary O(n) storage.
Commit invalidates dependent models; the next read rebuilds them. It is not an
incremental million-row engine. Batch sparse changes instead of rebuilding once
per cell. Logical remote datasets should use a bounded datasource cache.

Preparation and pipeline rebuilding run synchronously. Row and column
virtualization limits mounted DOM work, but does not reduce the data validated
by a transaction. Use representative product data to assess responsiveness and
avoid retaining obsolete proposals, source arrays or undo snapshots longer than
needed. A bounded [datasource](datasource.md) keeps remote records outside the
loaded client tree.
