import { defineComponent, h, onBeforeUnmount, shallowRef } from "vue";
import { createServerDataPanel } from "@rowick/vue-ui/server-data";
import { createDatasourceExample, datasourceColumns, getDatasourceChildScope, getDatasourceEvidence, getDatasourceExampleActions, type PersistentDataQuery, type PersistentDataRow } from "@rowick/example-shared-server/datasource-client";
const Panel = createServerDataPanel<PersistentDataRow, PersistentDataQuery>();
export default defineComponent({ setup() {
  const example = createDatasourceExample({ download: true }), revision = shallowRef(0), stop = example.subscribe(() => { revision.value++; }); void example.start();
  onBeforeUnmount(() => { stop(); example.dispose(); });
  return () => { revision.value; return h("main", { style: { padding: "24px", overflowWrap: "anywhere" } }, [h("h1", "Server datasource"), h("p", "Ten million logical records with bounded blocks, query selection and persistent HTTP recovery."),
    h("div", { role: "group", "aria-label": "Datasource scenarios" }, getDatasourceExampleActions(example).map(([label, action]) => h("button", { type: "button", onClick: () => { void action(); } }, label))),
    h("p", { role: "status", "aria-label": "Datasource scenario result" }, example.getMessage()), h("output", { "aria-label": "Datasource evidence" }, getDatasourceEvidence(example)),
    h(Panel, { controller: example.source, columns: datasourceColumns, actions: example.actions, getChildScope: getDatasourceChildScope, getRowLabel: (row: PersistentDataRow) => row.name }),
  ]); };
} });
