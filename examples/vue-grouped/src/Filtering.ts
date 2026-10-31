import { defineComponent, h, onBeforeUnmount, shallowRef } from "vue";
import { createDataGrid } from "@rowick/vue-ui";
import { FilterPanel } from "@rowick/vue-ui/filtering";
import "@rowick/vue-ui/filtering.css";
import type { Grid } from "@rowick/core";
import { createFilteringExample, filterRecords, filteringColumns, type FilterRecord } from "@rowick/example-shared-server/filtering-client";
const DataGrid = createDataGrid<FilterRecord>();
const getRowId = (row: FilterRecord) => row.id;
export default defineComponent({ setup() {
  const grid = shallowRef<Grid<FilterRecord>>(), session = shallowRef<ReturnType<typeof createFilteringExample>>(), revision = shallowRef(0); let stop = () => {};
  const ready = (value: Grid<FilterRecord>) => {
    if (value === grid.value) return; stop(); session.value?.dispose(); grid.value = value;
    session.value = createFilteringExample(value, { remoteCandidates: new URLSearchParams(location.search).has("remote") }); stop = value.subscribe(() => { revision.value++; });
  };
  onBeforeUnmount(() => { stop(); session.value?.dispose(); });
  return () => { revision.value; return h("main", { style: { padding: "24px" } }, [h("h1", "Advanced filtering"), h("p", "Build typed conditions, inspect candidates and save a view."),
    h(DataGrid, { ariaLabel: "Filter records", options: { data: filterRecords, columns: filteringColumns, getRowId }, onGridReady: ready, paginationControls: true, style: { height: "300px" } }),
    h("output", { "aria-label": "Matching rows" }, grid.value?.getFilteredRowModel().rows.map((row) => String(row.getValue("name") ?? "")).join(", ")),
    session.value && h("div", { role: "group", "aria-label": "Settings failure scenarios" }, [h("button", { type: "button", onClick: session.value.failStorage }, "Simulate storage failure"), h("button", { type: "button", onClick: session.value.restoreStorage }, "Restore storage"), h("button", { type: "button", onClick: session.value.failCandidates }, "Fail next candidate search")]),
    session.value && h(FilterPanel, { controller: session.value.controller, idPrefix: "example-filter" }),
  ]); };
} });
