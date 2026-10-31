# Data, state, and ownership

Grid data and column definitions are immutable inputs. Replace their arrays when
records or schema change. A stable `getRowId` preserves row identity through
reorder, insertion, deletion, and server page changes. See [ID validation](api-stability.md#id-validation).

## Replacing loaded data and columns

`setOptions` checks active focus, editing, and range coordinates against the new
loaded rows and leaf columns. Missing coordinates are cleared. A range is cleared
when either endpoint disappears. A surviving editor retains its coordinate when
its row's value changes, allowing the editor component to preserve a newer draft.
Existence is checked in the loaded core model, independently of filtering,
pagination, and whether a parent is collapsed.

With no active coordinates, row computation remains lazy. With active coordinates,
the replacement needs a valid core model. Invalid row/column definitions then
reject the replacement and restore the previous options/state. Input validation
errors do not expose product IDs or data. In-place mutation of existing inputs
is unsupported and cannot be rolled back.

Selection and edit history are retained. A server page transition must not discard
query-wide or off-page selection. For client deletions, call `pruneRowSelection`
with the appropriate scope after replacing data. History replay skips missing
rows/columns and applies its remaining valid changes. Local undo does not send a
compensating write to a server.

Structural cleanup emits state proposals rather than a fabricated user cancel
event. Editors own their drafts and popup cleanup; request/mutation coordinators
own pending remote operations. Unmounting an editor does not itself roll back an
accepted server write.

## Controlled and uncontrolled fields

`state` is a partial controlled overlay. Its fields take precedence over internal
state. `onStateChange` receives the complete proposed state; the owner accepts a
controlled change by supplying new `state` values. Uncontrolled fields update
internally. Rejecting a proposal intentionally retains the controlled input.

```ts
const grid = createGrid({ data, columns, getRowId, state: controlled,
  onStateChange: (proposal) => {
    controlled = { focusedCell: proposal.focusedCell };
    grid.setOptions((previous) => ({ ...previous, state: controlled }));
  },
});
grid.setOptions((previous) => ({ ...previous, data: nextData }));
```

`grid.reconcileState({ notify?: boolean })` explicitly performs the same cleanup
and returns the proposed complete state. Normal option replacement validates and
applies options, sends any cleanup proposal, then notifies subscribers.

`setOptions(..., { notify: false })` silently applies internal cleanup and defers
callbacks. React flushes proposals in an effect after render; Vue/Svelte flush
after synchronizing options. A custom adapter should call `reconcileState()` in
its safe commit phase. Later state changes supersede deferred proposals so old
coordinates are never replayed. Server rendering does not run React effects.

## Subscriptions and errors

Notifications use a snapshot in registration order. Listeners added during a
notification start on a later notification. Listeners removed before their turn
are skipped. Reentrant notifications are queued for another pass; they do not
recursively enter the same listener. Avoid a listener that unconditionally writes
another new state on every notification.

A failing `onStateChange` or listener does not prevent delivery to other
subscribers. State has already been applied. The caller receives the original
single error, or an `AggregateError` containing multiple failures, after delivery.
Callbacks should handle their own recoverable failures. There is no implicit
rollback after side effects have been published.

## Cleanup responsibilities

- Core `subscribe` and `subscribeSelector` return idempotent unsubscribe functions.
  Core `Grid` has no `dispose` method.
- React releases subscriptions through `useSyncExternalStore` and effect cleanup,
  including development StrictMode replay.
- Vue adapters release options watches and grid subscriptions with their scope,
  or with explicit `dispose()` outside a scope.
- Svelte adapters release options and active state subscriptions on `dispose()`.
  Disposal is idempotent and the owned state store retains its last snapshot.
  Other owners may continue to use the core grid. Selector stores release their
  own subscriptions when their last subscriber leaves.
- Request/mutation/selection coordinators have independent disposal contracts;
  the product must dispose the controllers it owns.
