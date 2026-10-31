import { useRef, useState } from "react";
import { DataGrid } from "@rowick/react-ui";
import type { Grid } from "@rowick/core";
import { prepareRowTransaction, type RowTransaction } from "@rowick/data";

interface RecordRow { id: string; name: string; amount: number; }
const initial: RecordRow[] = [{ id: "a", name: "Alpha", amount: 1 }, { id: "b", name: "Beta", amount: 2 }];
const columns = [{ accessorKey: "name" as const }, { accessorKey: "amount" as const }];
const getRowId = (row: RecordRow) => row.id;

export default function Transactions() {
  const [rows, setRows] = useState<readonly RecordRow[]>(initial);
  const latest = useRef(rows), sequence = useRef(0);
  const [grid, setGrid] = useState<Grid<RecordRow> | null>(null);
  const [status, setStatus] = useState("Ready");
  const run = (transaction: RowTransaction<RecordRow>, label: string) => {
    if (!grid) return;
    try {
      if (grid.getOptions().data !== latest.current) throw new Error("Data changed; retry action");
      const proposal = prepareRowTransaction(grid, transaction);
      latest.current = proposal.data; setRows(proposal.data); setStatus(label);
    } catch { setStatus("Transaction rejected; data unchanged. Retry against the current data."); }
  };
  return <main style={{ padding: 24 }}>
    <h1>Client transactions</h1>
    <p>Prepare a complete change, validate it, then accept it in product state.</p>
    <div role="group" aria-label="Data changes">
      <button disabled={!grid} onClick={() => run({ add: [{ data: { id: `new:${++sequence.current}`, name: "Added row", amount: 10 } }] }, "Row added")}>Add row</button>
      <button disabled={!grid || !rows.length} onClick={() => run({ update: [{ id: rows[0]!.id, data: { ...rows[0]!, amount: rows[0]!.amount + 1 } }] }, "Row updated")}>Update first row</button>
      <button disabled={!grid || !rows.length} onClick={() => run({ remove: [rows[0]!.id] }, "Row removed")}>Remove first row</button>
      <button disabled={!grid || !rows.length} onClick={() => run({ add: [{ data: { ...rows[0]! } }] }, "Unexpected duplicate acceptance")}>Try duplicate ID</button>
    </div>
    <p role="status" aria-label="Transaction result">{status}</p>
    <DataGrid ariaLabel="Transaction records" data={rows} columns={columns} getRowId={getRowId}
      onGridReady={setGrid} rowSelectionControls style={{ height: "320px" }} />
  </main>;
}
