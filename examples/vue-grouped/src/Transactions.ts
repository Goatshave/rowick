import { defineComponent, h, shallowRef } from "vue";
import { createDataGrid } from "@rowick/vue-ui";
import type { Grid } from "@rowick/core";
import { prepareRowTransaction, type RowTransaction } from "@rowick/data";

interface RecordRow { id: string; name: string; amount: number; }
const initial: RecordRow[] = [{ id: "a", name: "Alpha", amount: 1 }, { id: "b", name: "Beta", amount: 2 }];
const columns = [{ accessorKey: "name" as const }, { accessorKey: "amount" as const }];
const getRowId = (row: RecordRow) => row.id;
const TransactionGrid = createDataGrid<RecordRow>();

export default defineComponent({
  setup() {
    const rows = shallowRef<readonly RecordRow[]>(initial), grid = shallowRef<Grid<RecordRow> | null>(null);
    const status = shallowRef("Ready"); let sequence = 0;
    const run = (transaction: RowTransaction<RecordRow>, label: string) => {
      if (!grid.value) return;
      try {
        if (grid.value.getOptions().data !== rows.value) throw new Error("Data changed; retry action");
        const proposal = prepareRowTransaction(grid.value, transaction);
        rows.value = proposal.data; status.value = label;
      } catch { status.value = "Transaction rejected; data unchanged. Retry against the current data."; }
    };
    return () => h("main", { style: { padding: "24px" } }, [
      h("h1", "Client transactions"), h("p", "Prepare a complete change, validate it, then accept it in product state."),
      h("div", { role: "group", "aria-label": "Data changes" }, [
        h("button", { disabled: !grid.value, onClick: () => run({ add: [{ data: { id: `new:${++sequence}`, name: "Added row", amount: 10 } }] }, "Row added") }, "Add row"),
        h("button", { disabled: !grid.value || !rows.value.length, onClick: () => run({ update: [{ id: rows.value[0]!.id, data: { ...rows.value[0]!, amount: rows.value[0]!.amount + 1 } }] }, "Row updated") }, "Update first row"),
        h("button", { disabled: !grid.value || !rows.value.length, onClick: () => run({ remove: [rows.value[0]!.id] }, "Row removed") }, "Remove first row"),
        h("button", { disabled: !grid.value || !rows.value.length, onClick: () => run({ add: [{ data: { ...rows.value[0]! } }] }, "Unexpected duplicate acceptance") }, "Try duplicate ID"),
      ]),
      h("p", { role: "status", "aria-label": "Transaction result" }, status.value),
      h(TransactionGrid, { ariaLabel: "Transaction records", options: { data: rows.value, columns, getRowId },
        onGridReady: (value: Grid<RecordRow>) => { grid.value = value; }, rowSelectionControls: true, style: { height: "320px" } }),
    ]);
  },
});
