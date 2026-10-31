import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type DefineComponent, type PropType } from "vue";
import { addAnalyticsMetric, analyticsOperations, defaultAnalyticsLabels, moveAnalyticsAxis, setAnalyticsAxisSelection, updateAnalyticsMetric, type AnalyticsController, type AnalyticsLabels, type PivotOperation } from "@rowick/data/analytics";
export interface AnalyticsPanelProps<TData> { controller: AnalyticsController<TData>; labels?: Partial<AnalyticsLabels>; }
export function createAnalyticsPanel<TData>(): DefineComponent<AnalyticsPanelProps<TData>> {
  return defineComponent({ props: { controller: { type: Object as PropType<AnalyticsController<TData>>, required: true }, labels: { type: Object as PropType<Partial<AnalyticsLabels>>, default: undefined } }, setup(props) {
    const state = shallowRef(props.controller.getState()), error = shallowRef<string>(), scope = shallowRef<"pivot" | "records">("pivot"); let stop = () => {}, sequence = 0;
    onMounted(() => watch(() => props.controller, (controller) => { sequence++; stop(); state.value = controller.getState(); stop = controller.subscribe(() => { state.value = controller.getState(); }); }, { immediate: true })); onBeforeUnmount(() => { sequence++; stop(); });
    const run = (action: () => unknown) => { const intent = ++sequence; error.value = undefined; try { void Promise.resolve(action()).catch((failure: unknown) => { if (sequence === intent) error.value = failure instanceof Error ? failure.message : "Analytics action failed"; }); } catch (failure) { if (sequence === intent) error.value = failure instanceof Error ? failure.message : "Analytics action failed"; } };
    return () => {
      const current = state.value, controller = props.controller, labels = { ...defaultAnalyticsLabels, ...props.labels }, draft = current.draft;
      const button = (label: string, action: () => unknown, disabled = false) => h("button", { type: "button", disabled, onClick: () => run(action) }, label);
      const check = (label: string, checked: boolean, action: (value: boolean) => unknown, disabled = false) => h("label", [h("input", { type: "checkbox", checked, disabled, onChange: (event: Event) => run(() => action((event.target as HTMLInputElement).checked)) }), label]);
      const axes = (axis: "rows" | "columns", label: string) => {
        const selected = axis === "rows" ? draft.rowAxes : draft.columnAxes, other = axis === "rows" ? draft.columnAxes : draft.rowAxes;
        return h("div", [h("label", [label, h("select", { "aria-label": label, multiple: true, size: Math.max(1, Math.min(5, controller.fields.length)),
          onChange: (event: Event) => run(() => setAnalyticsAxisSelection(controller, axis, Array.from((event.target as HTMLSelectElement).selectedOptions, (option) => option.value))) }, controller.fields.map((field) => h("option", { value: field.id, selected: selected.includes(field.id), disabled: other.includes(field.id) }, field.label)))]),
          h("ol", { "aria-label": labels.axisOrder(label) }, selected.map((id, index) => { const name = controller.fields.find((field) => field.id === id)?.label ?? id; return h("li", { key: id }, [name,
            h("button", { type: "button", "aria-label": labels.moveAxis(axis, name, "up"), disabled: !index, onClick: () => run(() => moveAnalyticsAxis(controller, axis, index, "up")) }, "↑"),
            h("button", { type: "button", "aria-label": labels.moveAxis(axis, name, "down"), disabled: index + 1 === selected.length, onClick: () => run(() => moveAnalyticsAxis(controller, axis, index, "down")) }, "↓"),
          ]); })),
        ]);
      };
      const busy = current.exportState && ["idle", "collecting", "encoding"].includes(current.exportState.status);
      return h("section", { class: "rowick-analytics", "aria-label": labels.panel }, [
        h("fieldset", [h("legend", labels.panel), axes("rows", labels.rowAxes), axes("columns", labels.columnAxes),
          h("fieldset", [h("legend", labels.metrics), ...draft.metrics.map((metric, index) => h("fieldset", { key: metric.id }, [h("legend", metric.label),
            h("label", [labels.valueField, h("select", { "aria-label": labels.valueField, value: metric.columnId ?? "", onChange: (event: Event) => run(() => updateAnalyticsMetric(controller, index, { columnId: (event.target as HTMLSelectElement).value })) }, [!metric.columnId && h("option", { value: "" }, labels.countRows), ...controller.fields.map((field) => h("option", { value: field.id }, field.label))])]),
            h("label", [labels.operation, h("select", { "aria-label": labels.operation, value: metric.operation, onChange: (event: Event) => run(() => updateAnalyticsMetric(controller, index, { operation: (event.target as HTMLSelectElement).value as PivotOperation })) }, analyticsOperations.map((operation) => h("option", { value: operation, disabled: operation !== "count" && !metric.columnId }, operation)))]),
            button(labels.removeMetric, () => controller.setMetrics(draft.metrics.filter((_, position) => position !== index)), draft.metrics.length === 1),
          ])), button(labels.addMetric, () => addAnalyticsMetric(controller), draft.metrics.length >= 16)]),
          check(labels.subtotals, draft.subtotals === true, (value) => controller.setTotals(value, draft.rowTotals === true)), check(labels.rowTotals, draft.rowTotals === true, (value) => controller.setTotals(draft.subtotals === true, value)),
          ...(["rows", "columns"] as const).map((axis) => check(axis === "rows" ? labels.descendingRows : labels.descendingColumns, draft.sort?.some((rule) => rule.axis === axis && rule.index === 0 && rule.desc) ?? false,
            (value) => controller.setSorting([...(draft.sort ?? []).filter((rule) => rule.axis !== axis), { axis, index: 0, desc: value }]), !(axis === "rows" ? draft.rowAxes : draft.columnAxes).length)),
          h("div", { role: "group", "aria-label": labels.panel }, [button(labels.apply, controller.apply), button(labels.reset, controller.reset), button(labels.saveView, controller.saveView), button(labels.restoreView, controller.restoreView)]),
        ]),
        (error.value ?? current.error) && h("p", { role: "alert" }, error.value ?? current.error), current.message && h("p", { role: "status" }, current.message),
        h("p", { role: "status" }, labels.summary(current.result.rows.length, current.result.columns.length)),
        h("table", [h("caption", labels.results), h("thead", [h("tr", [h("th", { scope: "col" }, labels.row), ...current.pageColumns.map((column) => h("th", { key: column.id, scope: "col" }, column.headers.join(" / ")))])]),
          h("tbody", current.pageRows.map((row) => h("tr", { key: row.id }, [h("th", { scope: "row" }, labels.rowLabel(row)), ...current.pageColumns.map((column) => h("td", { key: column.id }, row.cells[column.id] === null ? "" : String(row.cells[column.id])))]))),
        ]),
        h("div", { role: "group", "aria-label": labels.results }, [button(labels.previousRows, () => controller.setPage(current.pageIndex - 1), !current.pageIndex), button(labels.nextRows, () => controller.setPage(current.pageIndex + 1), current.pageIndex + 1 >= current.pageCount),
          button(labels.previousColumns, () => controller.setColumnPage(current.columnPageIndex - 1), !current.columnPageIndex), button(labels.nextColumns, () => controller.setColumnPage(current.columnPageIndex + 1), current.columnPageIndex + 1 >= current.columnPageCount),
          h("span", labels.page(current.pageIndex + 1, current.pageCount, current.columnPageIndex + 1, current.columnPageCount))]),
        h("label", [labels.exportScope, h("select", { "aria-label": labels.exportScope, value: scope.value, disabled: !!busy, onChange: (event: Event) => { scope.value = (event.target as HTMLSelectElement).value as "pivot" | "records"; } }, [h("option", { value: "pivot" }, labels.pivotScope), h("option", { value: "records" }, labels.recordScope)])]),
        h("div", { role: "group", "aria-label": labels.exportScope }, [...current.formats.map((format) => button(labels.export(format), () => controller.export(format, scope.value), !!busy)), button(labels.cancelExport, controller.cancelExport, !busy)]),
        current.exportState && h("div", [h("progress", { "aria-label": labels.progress, max: 1, value: current.exportState.progress }), h("p", { role: "status" }, labels.exportStatus(current.exportState.status, current.exportState.rowsProcessed))]),
      ]);
    };
  } }) as unknown as DefineComponent<AnalyticsPanelProps<TData>>;
}
export const AnalyticsPanel = createAnalyticsPanel<unknown>();
