# Row and batch editing

This feature is part of the unpublished Rowick 0.1.0 candidate.
A row editing form can be placed beside an
existing grid or inside a product drawer; it does not take ownership of transport.

```ts
import {
  createRowEditingController,
  createRowEditingForm,
} from "@rowick/data/editing";

const editor = createRowEditingController<RecordRow>({
  getRow: (id) => authoritativeRows.get(id),
  getRowId: (row) => row.id,
  getValue: (row, column) => row[column],
  applyValues: (row, values) => ({ ...row, ...values }),
  getVersion: (row) => row.revision,
  getContextKey: () => currentQueryId,
  canEdit: (id, column, row) => permissions.allow(id, column, row),
  validate: async ({ candidate, signal }) => validateRow(candidate, signal),
  save: async ({ candidate, version, operationId, signal }) =>
    saveRow({ candidate, expectedVersion: version, operationId, signal }),
  accept: (id, row) => {
    // Update the authoritative reader synchronously before notifying a framework.
    authoritativeRows.set(id, row);
    setRows([...authoritativeRows.values()]);
  },
});
const form = createRowEditingForm(editor, [
  { id: "name", label: "Name", kind: "text", required: true },
  { id: "amount", label: "Amount", kind: "currency", scale: 2 },
  { id: "date", label: "Date", kind: "date" },
  { id: "active", label: "Active", kind: "boolean" },
  { id: "notes", label: "Notes", kind: "long-text", maxLength: 2_000 },
]);
editor.begin(recordId);
```

The named product functions in this example are application responsibilities.
Keep identity/accessor/version/context/permission/apply callbacks pure. Row
objects and submitted values must be immutable. `applyValues` must preserve
unmodified values and row identity. `accept` is synchronous: update the reader
before returning, then schedule the framework render. For tree data, use the
[transaction writer](./transactions.md) to replace the accepted row immutably.

Use these optional UI entries:

```tsx
import { RowEditingPanel } from "@rowick/react-ui/editing";
import "@rowick/react-ui/editing.css";
<RowEditingPanel form={form} />;
```

```ts
import { createRowEditingPanel } from "@rowick/vue-ui/editing";
const Panel = createRowEditingPanel<RecordRow>();
// h(Panel, { form, idPrefix: "orders-row-editing" })
```

```svelte
<script>
  import { RowEditingPanel } from "@rowick/svelte-ui/editing";
</script>
<RowEditingPanel {form} idPrefix="orders-row-editing" />
```

Vue/Svelte require a stable, page-unique `idPrefix` for accessible error links and
SSR. React uses `useId`. All three panels expose save/cancel per row, save/cancel
all, draft undo/redo, retry and conflict rebase. `labels` accepts translated
buttons, status and summary formatters. Field labels are supplied by the product.
The native form controls work with keyboard input; automated composition events
are separate from real OS IME acceptance checks.
Import the corresponding UI package's `/editing.css` entry for optional styling;
the base grid CSS does not include these form styles.

Create controllers/forms in the product's lifecycle and dispose them at teardown.
In React, create them in an effect or an external data owner and clean up the
effect; subscribing during a discarded render can leak subscriptions. Panels own
their UI subscription only. Dispose the form before disposing the row controller.
Svelte 4 and 5 use the same component entry. Headless consumers subscribe to
immutable, stable `getState()` snapshots.

## Draft and save semantics

`begin` opens a loaded row. `setValue` changes a draft without changing accepted
data. `project(id, row)` overlays a draft for grid display. The authoritative
`getRow` reader must continue to read accepted data, independently of projections.
Call `reconcile` when the owner replaces data or changes query context; missing
rows and incompatible revisions become conflicts. Unloaded rows cannot be edited.

One submission validates the complete candidate, then saves in the same per-row
serial lane. The default allows 100 draft rows, 4 pending saves per row and 4
active rows globally, with at most 200 dirty fields per row. Each validation/save phase has a 30-second timeout. All
limits are configurable within explicit bounds. Repeated submission of the same
revision shares its promise. A newer revision queues a new intent. Errors from
an older revision do not replace the newer draft's field errors.

An acknowledgement updates accepted data while keeping fields changed since
that submission. Queued snapshots omit unchanged fields already acknowledged by
their predecessor, preserving server normalization. Permissions and authoritative
version are checked again after asynchronous validation. The server must also
validate authorization, identity, validation rules, query scope and revision.
Versions must change for each accepted/external write. Without `getVersion`,
reference identity is the local conflict token, not a distributed revision.

The lifecycle statuses are `editing` → `queued` → `validating` → `saving` and then
success/removal, `validation-error`, `conflict` or `error`. A cancelled/expired
request returns `cancelled`; an incompatible successful response returns `stale`.
Save results never silently coerce a different row ID. A query context change
prevents an old response from updating the current query's data.

Cancellation/disposal stops waiting and aborts the transport signal. It cannot
roll back a server write or prove that an uncooperative transport did not commit.
After an uncertain outcome, refresh/reconcile authoritative data. Retrying the
unchanged failed submission retains its operation ID; the server must implement
idempotency and compare-and-swap. Editing after failure requires a new submission.
An acknowledged write whose `accept` callback failed returns `apply-error`; its
retry reapplies the response without repeating transport. An accept callback that
partially updates product state must be repaired by the product before retrying.

`commitAll` returns independent results per row. Successful rows leave the form;
failed rows retain their drafts and errors. Cross-row database atomicity is a
separate server transaction contract, not a promise of the form.

## Typed input and history

`number` is explicitly a finite binary64 value within the safe numeric range;
`integer` additionally requires a safe integer. Decimal/currency input preserves
its exact string spelling and optional scale, including values above 2⁵³. Dates
are validated calendar strings and are not converted to `Date` or UTC. Boolean
accepts booleans; select IDs remain strings. Optional empty input stays `""`,
not zero/null. Product validation decides whether empty is allowed by its schema.

The built-in numeric parser uses a dot decimal separator and no grouping/currency
symbol. Formatting is separate from parsing; do not feed formatted currency text
back into a numeric parser. For locale-specific parsing, use a product parser
before `editor.setValue`, retaining precision and the declared schema type.

Async select searches are cancellable and stale-response fenced, retain one
bounded result set per open field (200 choices by default), expose loading/error
and retry, and reject duplicate IDs/disabled choices. Large vocabularies should
use server search. Server validation remains authoritative when choices change.
The form retains invalid raw input and composition text and blocks that row's
save until input is valid. Invalid rows do not prevent saving independent rows.

`setValues` validates all target rows/permissions before applying a batch and
creates one local undo boundary, suitable for product paste/fill transactions.
The built-in grid's cell history and these row drafts are separate histories:
do not replay both for the same edit. Draft undo/redo is disabled while saving;
acknowledgement, cancellation and rebase clear draft history. Undo does not send
a compensating server write. A product's server undo requires a new authorized
operation with current revision, explicit confirmation semantics and conflict
handling. M5 tracks the grid's native multi-range clipboard integration.

Run `/editing` in the React, Vue and Svelte basic examples to exercise delayed
saves, new input during save, failures, partial batch results, read-only fields,
external revisions, paste/fill boundaries and cancellation/reopening.
