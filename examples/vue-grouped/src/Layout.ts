import { defineComponent, h, onBeforeUnmount, ref } from "vue";
import { createLayoutGrid } from "@rowick/vue-ui/layout";
import { createRowEditingPanel } from "@rowick/vue-ui/editing";
import "@rowick/vue-ui/layout.css";
import "@rowick/vue-ui/editing.css";
import { createLayoutExample, downloadLayoutArtifact, installLayoutTestBridge, type LayoutRecord } from "@rowick/example-shared-server/layout-client";
const Grid = createLayoutGrid<LayoutRecord>(), Panel = createRowEditingPanel<LayoutRecord>();
export default defineComponent({ name: "LayoutExample", setup() {
  const source = createLayoutExample(new URLSearchParams(location.search).get("dir") === "rtl" ? "rtl" : "ltr"), revision = ref(0), visible = ref(true), error = ref<string>();
  const stop = source.subscribe(() => revision.value++), cleanup = installLayoutTestBridge(source, (next) => { visible.value = next; });
  onBeforeUnmount(() => { cleanup(); stop(); source.dispose(); });
  const run = async (action: () => unknown) => { error.value = undefined; try { await action(); } catch (failure) { error.value = failure instanceof Error ? failure.message : "Action failed"; } };
  return () => { revision.value; return h("main", { style: "padding:24px" }, [h("h1", "Advanced layout"), h("p", `10,000 records × 20 columns. Stable IDs, variable heights, interactive details, pinned rows and columns, native merges and draft history. Direction: ${source.direction}.`),
    h("div", { role: "group", "aria-label": "Layout scenarios" }, [...source.actions.map(([label, action]) => h("button", { type: "button", onClick: () => void run(action) }, label)),
      ...([["Export selected CSV", "csv", "range"], ["Export selected XLSX", "xlsx", "range"], ["Export page CSV", "csv", "page"]] as const).map(([label, format, scope]) => h("button", { onClick: () => void run(async () => downloadLayoutArtifact(await source.export(format, scope))) }, label))]),
    error.value ? h("p", { role: "alert" }, error.value) : null,
    visible.value ? h(Grid, { controller: source.layout, idPrefix: "example-layout", height: 440, renderDetail: ({ row }) => h("fieldset", [h("legend", `Details for ${row.id}`), h("label", [`Detail note ${row.id}`, h("input", { "aria-label": `Detail note ${row.id}`, value: source.getNote(row.id), onInput: (event: Event) => source.setNote(row.id, (event.target as HTMLInputElement).value) })]), h("button", { onClick: () => source.toggleExpanded(row.id) }, source.getExpanded(row.id) ? "Shrink detail" : "Grow detail"), h("p", Array.from({ length: source.getExpanded(row.id) ? 14 : 1 }, (_, index) => h("span", { style: "display:block" }, `Interactive detail line ${index + 1}`)))]) }) : null,
    h("output", { "aria-label": "Draft first rows" }, JSON.stringify(source.getSummary())), h("output", { "aria-label": "Accepted row order" }, source.getRows().slice(0, 5).map((row) => row.id).join(",")), h(Panel, { form: source.form, idPrefix: "layout-row-form" }),
  ]); };
} });
