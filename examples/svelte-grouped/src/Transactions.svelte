<script lang="ts">
  import { DataGrid } from "@rowick/svelte-ui";
  import type { Grid } from "@rowick/core";
  import { prepareRowTransaction, type RowTransaction } from "@rowick/data";
  interface RecordRow { id: string; name: string; amount: number; }
  let rows: readonly RecordRow[] = [{ id: "a", name: "Alpha", amount: 1 }, { id: "b", name: "Beta", amount: 2 }];
  const columns = [{ accessorKey: "name" as const }, { accessorKey: "amount" as const }];
  const getRowId = (row: RecordRow) => row.id;
  let grid: Grid<RecordRow> | null = null, sequence = 0, status = "Ready";
  $: options = { data: rows, columns, getRowId };
  function run(transaction: RowTransaction<RecordRow>, label: string) {
    if (!grid) return;
    try {
      if (grid.getOptions().data !== rows) throw new Error("Data changed; retry action");
      const proposal = prepareRowTransaction(grid, transaction);
      rows = proposal.data; status = label;
    } catch { status = "Transaction rejected; data unchanged. Retry against the current data."; }
  }
</script>

<main style="padding: 24px">
  <h1>Client transactions</h1>
  <p>Prepare a complete change, validate it, then accept it in product state.</p>
  <div role="group" aria-label="Data changes">
    <button disabled={!grid} on:click={() => run({ add: [{ data: { id: `new:${++sequence}`, name: "Added row", amount: 10 } }] }, "Row added")}>Add row</button>
    <button disabled={!grid || !rows.length} on:click={() => run({ update: [{ id: rows[0]!.id, data: { ...rows[0]!, amount: rows[0]!.amount + 1 } }] }, "Row updated")}>Update first row</button>
    <button disabled={!grid || !rows.length} on:click={() => run({ remove: [rows[0]!.id] }, "Row removed")}>Remove first row</button>
    <button disabled={!grid || !rows.length} on:click={() => run({ add: [{ data: { ...rows[0]! } }] }, "Unexpected duplicate acceptance")}>Try duplicate ID</button>
  </div>
  <p role="status" aria-label="Transaction result">{status}</p>
  <DataGrid ariaLabel="Transaction records" {options} onGridReady={(value) => { grid = value; }} rowSelectionControls style={{ height: "320px" }} />
</main>
