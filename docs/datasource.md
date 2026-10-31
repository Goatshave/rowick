# Remote datasource and persistent recovery

This optional feature is part of the unpublished Rowick 0.1.0 candidate.
`@rowick/data/server-data` provides a bounded remote row model;
transport, authentication, database execution and final authorization remain in
the product. The default core still consumes only the rows the owner supplies.

```ts
import { createDataSourceController } from "@rowick/data/server-data";

const source = createDataSourceController<RecordRow, ProductQuery>({
  query: { tenant: authenticatedTenant, filters, sorting },
  getRowId: (row) => row.id,
  getRowRevision: (row) => row.revision,
  maxBlockSize: 100,
  maxBlocks: 20,
  maxCachedRows: 2_000,
  concurrency: 4,
  maxQueuedRequests: 32,
  source: {
    getRows: async ({ query, queryId, queryKey, block, signal }) =>
      fetchRows({ query, queryId, queryKey, block, signal }),
  },
});
await source.load({ mode: "offset", offset: 0, limit: 100 });
// Also supported:
await source.load({ mode: "page", pageIndex: 1, limit: 100 });
await source.load({ mode: "cursor", cursor: null, limit: 100 });
await source.load({ mode: "offset", offset: 0, limit: 100,
  scope: { kind: "tree", parentId: parent.id } });
await source.load({ mode: "offset", offset: 0, limit: 100,
  scope: { kind: "group", parentId: group.id, path: ["APAC", "Open"] } });
```

`fetchRows` above is a product API, not a built-in network endpoint. Use
`validateDataBlockRequest` in a backend adapter and validate the query against the
server's allowed columns/operators. `captureDataQuery` captures finite JSON,
sorts object keys and produces a deterministic `queryKey`. Queries reject cycles,
getters, sparse arrays, nonfinite numbers and oversized values. Put tenant,
permission universe and all semantic filters/sorts in the query identity. Never
use a cache key as authorization. The server derives allowed tenants and columns
from the authenticated principal and uses parameterized database queries.

## Request-owned SSR prefetch and hydration

`DataSourceHydration<TRow>` version 1 transfers a settled, fresh bounded cache.
`controller.dehydrate()` contains the canonical `queryKey`, root total/aggregates,
revision, active segment and blocks in their current LRU order. It omits query IDs,
selection/exclusions, operation snapshots, errors, jobs, signals, callbacks and
transports. It refuses pending work, failures, invalidation and an active segment
whose rows are unavailable; it does not turn an unresolved remote request into a
successful prefetch.

```ts
// One owner per authenticated request. Do not cache this across principals.
const prefetch = createDataSourceController({ ...productOptions, query });
let initialData;
try {
  const result = await prefetch.load({ mode: "offset", offset: 0, limit: 100 });
  if (result.status !== "loaded" && result.status !== "cached") {
    throw new Error("Prefetch did not complete");
  }
  initialData = prefetch.dehydrate();
} finally {
  prefetch.dispose();
}

// Recreate the same initial view on both server and client, using the same
// authenticated query, row schema and compatible cache limits.
const controller = createDataSourceController({
  ...productOptions,
  query,
  initialData,
});
// Pass controller to ServerDataPanel. Its first snapshot already has the rows.
// After client hydration, product freshness policy may explicitly refresh it:
// await controller.refresh();
```

The constructor restores synchronously and starts no network work. Every restored
response is rebound to the new owner's query ID through normal response checks.
The DTO cannot restore a server operation acknowledgement into the client query
universe. Custom `createQueryId` factories must generate a unique identity per
owner/universe, including across server and client; a constant or restarted local
counter is unsuitable. The initial client selection is empty. For identical first
HTML, render the server view from the same DTO before adding interaction state;
do not render a separately selected server controller and expect selection to be
serialized. Create actions/listeners for each owner and dispose the owner at the
end of its request or UI lifetime.

The query key, DTO version, complete metadata shape, block/request identities,
active-block membership, row identities/revisions, one shared snapshot revision,
root metadata consistency and the receiving owner's row/block caps are validated.
Duplicate blocks, sparse/accessor arrays, invalid rows, mixed revisions and a DTO
larger than the client's budget are rejected rather than partly restored. Root
metadata survives even if LRU eviction leaves only a child segment. Row arrays
and DTO structure are copied/frozen; the product still owns immutable row values.

Rows are transport-neutral generic values. The product must serialize/revive its
declared row schema (including dates, large decimals and IDs), enforce a payload
size limit before parsing, and use its framework's safe data serialization instead
of inserting unescaped JSON into HTML. Hydration validates structure and row
identity, not authorization or arbitrary record fields. Recheck permissions on
every backend read/bulk/export. Never put secret tokens in the query key or reuse
prefetched data across authenticated users.

Here “fresh” means the cache has not been marked stale by this controller; it is
not a wall-clock TTL or a promise that a snapshot remains current during transit.
The product owns expiry/revalidation/live resync after hydration and chooses the
same initial query/locale/render options on server and client. The file-backed
example remains a fixture, not evidence of real-product adoption.

## Responses, counts and row coordinates

Return the request's `queryId`, immutable `rows`, monotonic nonnegative integer
`revision`, `hasNext`, and either `total: { kind: "exact", count }` or
`total: { kind: "unknown" }`. Unknown is not zero. Response IDs must be nonempty,
unique within a block, at most 1,000 characters and compatible with the core's
reserved `__group__` namespace. Child scopes may reference synthetic group IDs;
returned product rows still need their own stable IDs. Duplicate response IDs,
invalid totals/revisions or rows exceeding the declared block/total are errors.

Cursor tokens are opaque. A cursor response with `hasNext: true` must return an
advancing `nextCursor`. Omit `previousCursor` when previous navigation is not
available; `previousCursor: null` means the initial cursor is the previous window.
The controller never invents a last-page cursor from an exact count. Server
group/tree blocks have scoped totals; they do not replace the root-query total.
An expired cursor remains an error with retained rows; use `getFirstDataBlock`
to restart that cursor universe. Retry preserves the failed opaque token and
does not silently reinterpret it as an offset.

`rowOffset`, when known, is the absolute zero-based rank of the first returned
row in that query/scope. The UI uses `absoluteRowOffset` to expose correct ARIA
row indexes for arbitrary offsets and known cursor ranks. A cursor without rank
uses `absoluteRowOffset: null`, omitting body `aria-rowindex` rather than claiming
it starts at zero. Exact/unknown total and current segment rank are independent.
The server can know one without knowing the other.

## Cache, cancellation and lifecycle

The controller stores at most the configured blocks/row references. It never
allocates an array corresponding to the logical total. LRU eviction retains the
active block when possible. `load(block, { activate: false })` prefetches without
replacing the current display. A prefetch may be evicted immediately when the
active block consumes the whole cache. `getLoadedRows()` deduplicates loaded IDs;
it is not the complete dataset.

Equal outstanding blocks coalesce. Requests without individual signals share
one promise. Individual signal waiters can cancel their own wait without
cancelling another caller; when every signal waiter cancels and no unconditional
caller remains, the source transport is aborted. The default caps 64 signal
waiters per block. Active requests, queued requests, block size and request time
are bounded. Aborted/expired work cannot apply a late provider result. Providers
must pass the signal to a cooperative transport; cancellation cannot stop an
implementation that ignores it or undo a committed server mutation.

`setQuery` clears cache/selection and creates a new query universe when the
canonical query changes. The same query preserves its universe and selection.
`refresh` keeps accepted display rows as stale while issuing a new generation;
read failures retain those rows and expose an error/retry state. `invalidate`
marks one block or the whole cache stale. `cancel` settles queued/active waits.
`dispose` is idempotent, aborts work and releases cache/listeners without applying
late responses. Dispose action controllers before the datasource owner.

Replacing a displayed block passes only its rows to the core. Existing
[coordinate reconciliation](state-lifecycle.md) clears unloaded focus/editor/range
endpoints. Query selection remains outside loaded row state and survives cache
eviction. Prefetching a different block preserves active rows and their focus.

## Live revisions and resynchronization

`applyLive` accepts events scoped to the current `queryId`. Old/wrong-query events
are ignored. A contiguous `update` with `impact: "patch"` may replace a loaded row
when the server certifies unchanged filter membership, sort/group position and
any unprovided aggregates. The row revision must advance. Updated root totals
and aggregates can accompany the event. Reads begun before that event are fenced.

Add/delete, query-membership/order changes, incompatible row revisions and gaps
in the global revision stream invalidate the query and require an authoritative
refresh. Known deleted loaded rows and explicit selected IDs disappear
immediately. Responses from older snapshots cannot roll back a newer revision;
a server restore must establish a new revision/query universe rather than reuse
an old counter. The example's revision-gap button commits three real HTTP writes
and delivers only the third event, then recovers by refreshing from persistence.

## Selection, bulk operations and export

```ts
import { createDataSourceActions } from "@rowick/data/server-data";
source.selectAllMatching();
source.setRowSelected(excludedId, false);
const operation = source.captureSelection({ maxRows: 10_000 });
// The same immutable descriptor is suitable for bulk and server export.

const actions = createDataSourceActions(source, {
  maxRows: 10_000,
  bulk: (selection, { signal }) => applyBulk(selection, signal),
  export: (selection, { signal }) => startServerExport(selection, signal),
});
await actions.run("bulk");
```

Explicit selection stores IDs; all-matching stores exclusions. Both are capped
(5,000 IDs by default). Loaded checkbox changes update only those rows and do
not turn a page checkbox into all-query selection. `captureSelection` freezes the
query/mode/IDs/exclusions with query ID, observed revision, operation ID, row limit
and `evaluation: "live-query"`. Server bulk and export must re-evaluate that
query at execution time, remove nonexistent rows, check per-row authorization,
apply the row limit before mutating, and bound execution/job resources. A child
block is a view into the root query; all-query selection still names that query.
Use a separately scoped query/controller when an operation should target only a
particular child universe.

An observed revision is evidence, not snapshot isolation. A product requiring a
historical snapshot must use a server snapshot token and an explicit different
execution policy. Do not claim that cached or excluded IDs prove existence or
authorization. Server IDs must remain stable and must not be recycled between
unrelated records in the same universe.

The action controller allows one operation at a time, deduplicates duplicate
clicks, times out/aborts waits, fences changed queries and retains the exact
operation snapshot/ID on retry after an uncertain response. Changing the current
checkboxes does not change an old operation's retry. The default UI displays the
submitted selection separately for that reason. The server must implement a
durable idempotency ledger and authorization checks on retries. A lost response
does not prove a rollback. New operations receive new IDs; export uses the same
selection meaning but may have different read permission from mutation.

## Optional UI and running examples

React exports `ServerDataPanel` from `@rowick/react-ui/server-data`; Vue exports
`createServerDataPanel<Row, Query>()` and `ServerDataPanel` from
`@rowick/vue-ui/server-data`; Svelte exports `ServerDataPanel` from
`@rowick/svelte-ui/server-data`. Pass `controller`, typed `columns`, optional
`actions`, translated `labels` and optional `getChildScope/getRowLabel`. The panel
uses the existing virtualized grid and provides navigation, unknown totals,
loading/stale/error/retry, query selection, bulk/export and child/root controls.
It subscribes only while mounted and does not own/dispose the data controller.
The panel is a read-only remote view. It always enables manual sorting/filtering/
grouping and disables those query actions unless `onGridStateChange` is supplied.
To connect remote query controls, also supply controlled `gridState`, translate
semantic sorting/filtering/grouping changes into `source.setQuery`, and load the
first block. Compare query fields so focus/resize/selection events do not start a
new query. A loaded block is never silently sorted/filtered as if it were the
whole server dataset. Cell editing can be composed with the separate row editing
controller or a custom headless renderer; this read-only panel does not fabricate
accepted writes.

Run `/server-data` in the three basic examples. They use actual same-origin HTTP,
10,000,000 generated logical root records, a 3-block/60-row client cache and an
atomic file store under the OS temporary directory. A tab's demo session survives
reload through session storage when available. No product integration is implied.
Buttons cover page/offset/cursor, rank-unknown advanced filtering, groups/tree,
slow/failed reads, live changes/gaps, partial permissions, lost acknowledgements,
retry and selected JSON export. Use **Small query** for the 40-row bulk example;
the full ten-million-row query is correctly rejected by its 1,000-row demo
operation cap. Large production bulk/export belongs in a bounded server job.

The private fixture uses an authenticated adapter hook, same-origin write checks,
bounded JSON requests/responses, per-session files and explicit schema/operator
allowlists. Its default session token is only local demonstration isolation,
not production authentication. Deployments must replace it with their actual
authorization layer. The file store persists accepted rows, monotonic revision,
signed revision-scoped cursors and idempotent results; writes use a flushed
temporary file and atomic rename. Tests reopen it in a **fresh Node process** and
restart the HTTP handler after a lost committed response. They verify the same
operation is acknowledged without reapplying it.

This fixture is intentionally a single-process writer, not a database. It does
not promise multi-process locking or power-loss durability. Stored overrides,
sessions, file bytes and ledger entries have caps. Ledger capacity rejects new
operations and preserves old acknowledgements; entries are not silently evicted.
Malformed persistence is preserved and rejected for recovery. Production ledger
retention/expiry and migrations need an explicit operational policy. The example
limits expensive filtered scans, uses a bounded 32-window previous-cursor history
and rejects unsupported large filtered offsets/aggregations/bulk work. An indexed
backend can implement the same public datasource contract without those fixture
limits. None of these limits changes the public grid's logical data-size bound.
