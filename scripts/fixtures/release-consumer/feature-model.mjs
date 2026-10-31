import { createGrid } from "@rowick/core";
import { createRowEditingController } from "@rowick/data/editing";
import { createFilterPanelController } from "@rowick/data/filtering";
import { createGridLayoutController } from "@rowick/data/layout";
import { createDataSourceController } from "@rowick/data/server-data";
import { createAnalyticsController } from "@rowick/data/analytics";
export function createFeatureModel(options = {}) {
  const rows = [{ id: "a", name: "Installed optional", amount: 12 }];
  const columns = [{ accessorKey: "name", enableEditing: true }, { accessorKey: "amount", filterValueType: "number" }];
  const grid = createGrid({ data: rows, columns, getRowId: (row) => row.id });
  const editing = createRowEditingController({ getRow: () => rows[0], getRowId: (row) => row.id, getValue: (row, id) => row[id], applyValues: (row, values) => ({ ...row, ...values }), accept: () => {} });
  const filter = createFilterPanelController({ grid });
  const layout = createGridLayoutController(grid, { editing });
  const remote = createDataSourceController({ query: { status: "all" }, getRowId: (row) => row.id, initialData: options.initialData,
    source: { getRows: async (request) => ({ queryId: request.queryId, rows, total: { kind: "exact", count: 1 }, rowOffset: 0, revision: 1, hasNext: false }) } });
  const analytics = createAnalyticsController({ fields: [{ id: "name", label: "Name", getValue: (row) => row.name }, { id: "amount", label: "Amount", getValue: (row) => row.amount }], getRows: () => rows,
    configuration: { version: 1, rowAxes: ["name"], columnAxes: [], metrics: [{ id: "total", columnId: "amount", label: "Total", operation: "sum" }] } });
  return { rows, columns, grid, editing, filter, layout, remote, analytics, dispose: () => { analytics.dispose(); remote.dispose(); layout.dispose(); filter.dispose(); editing.dispose(); } };
}
