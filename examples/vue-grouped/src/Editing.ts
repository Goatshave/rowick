import { defineComponent, h, onBeforeUnmount, shallowRef } from "vue";
import { createDataGrid } from "@rowick/vue-ui";
import { createRowEditingPanel } from "@rowick/vue-ui/editing";
import "@rowick/vue-ui/editing.css";
import { createRowEditingExample, editingColumns, type EditableRecord } from "@rowick/example-shared-server/row-editing-client";
const Grid = createDataGrid<EditableRecord>(), Panel = createRowEditingPanel<EditableRecord>();
export default defineComponent({ setup() {
  const session = createRowEditingExample(), revision = shallowRef(0), stop = session.subscribe(() => { revision.value++; });
  onBeforeUnmount(() => { stop(); session.dispose(); });
  const actions = [["Edit a", () => session.begin("a")], ["Edit b", () => session.begin("b")], ["Hold saves", session.hold], ["Release saves", session.release],
    ["Fail next save for b", session.failNext], ["External update a", session.externalUpdate], ["Change query", session.changeQuery], ["Paste two rows", session.paste], ["Fill amounts", session.fill]] as const;
  return () => { revision.value; return h("main", { style: { padding: "24px", overflowWrap: "anywhere" } }, [h("h1", "Row editing"), h("p", "Drafts, asynchronous validation, serialized saves and recovery."),
    h("div", { role: "group", "aria-label": "Editing scenarios" }, actions.map(([label, action]) => h("button", { type: "button", onClick: action }, label))),
    h(Grid, { ariaLabel: "Draft records", options: { data: session.getProjectedRows(), columns: editingColumns, getRowId: (row) => row.id }, style: { height: "240px" } }),
    h("output", { "aria-label": "Accepted data" }, JSON.stringify(session.getRows())), h(Panel, { form: session.form, idPrefix: "example-row-edit" }),
  ]); };
} });
