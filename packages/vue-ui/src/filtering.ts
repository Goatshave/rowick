import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type DefineComponent, type PropType, type VNodeChild } from "vue";
import { defaultFilterPanelLabels, describeActiveFilters, type FilterDraftCondition, type FilterDraftGroup, type FilterPanelController, type FilterPanelLabels, type FilterPanelSection } from "@rowick/data/filtering";
import { getFilterOperators, type FilterOperator } from "@rowick/core";
export interface FilterPanelProps { controller: FilterPanelController; idPrefix: string; labels?: Partial<FilterPanelLabels>; sections?: readonly FilterPanelSection[]; }
export const FilterPanel: DefineComponent<FilterPanelProps> = defineComponent({
  props: {
    controller: { type: Object as PropType<FilterPanelController>, required: true }, idPrefix: { type: String, required: true },
    labels: { type: Object as PropType<Partial<FilterPanelLabels>>, default: undefined }, sections: { type: Array as PropType<readonly FilterPanelSection[]>, default: () => ["filters", "columns", "facets", "views"] },
  },
  setup(props) {
    const state = shallowRef(props.controller.getState()), columnQuery = shallowRef(""), widths = shallowRef(new Map<string, string>()); let stop = () => {};
    onMounted(() => { watch(() => props.controller, (controller) => { stop(); state.value = controller.getState(); stop = controller.subscribe(() => {
      const next = controller.getState(), nextWidths = new Map(widths.value);
      for (const column of next.allColumns) if (state.value.allColumns.find((previous) => previous.id === column.id)?.size !== column.size) nextWidths.delete(column.id);
      widths.value = nextWidths; state.value = next;
    }); }, { immediate: true }); });
    onBeforeUnmount(() => stop());
    const run = (operation: () => unknown) => { try { void Promise.resolve(operation()).catch(() => {}); } catch { /* The controller publishes its error. */ } };
    return () => {
      const controller = props.controller, labels = { ...defaultFilterPanelLabels, ...props.labels }, prefix = props.idPrefix, value = state.value;
      const eventValue = (event: Event) => (event.target as HTMLInputElement).value;
      const button = (label: string, operation: () => unknown, disabled = false, id?: string) => h("button", { type: "button", disabled, id, onClick: () => run(operation) }, label);
      const label = (id: string, text: string) => h("label", { for: id }, text);
      const option = (value: string, text: string) => h("option", { value }, text);
      const check = (text: string, checked: boolean, action: (value: boolean) => void, disabled = false) => h("label", [h("input", { type: "checkbox", checked, disabled, onChange: (event: Event) => run(() => action((event.target as HTMLInputElement).checked)) }), text]);
      const remove = (nodeId: string, parentId: string) => { controller.remove(nodeId); requestAnimationFrame(() => document.getElementById(`${prefix}-${parentId}-add`)?.focus()); };
      const condition = (node: FilterDraftCondition, path: string, parentId: string): VNodeChild => {
        const id = `${prefix}-${node.id}`, policy = value.columns.find((column) => column.id === node.columnId), operators = policy?.operators ?? (policy ? getFilterOperators(policy.type) : []), error = value.errors[node.id];
        const set = (patch: Parameters<FilterPanelController["updateCondition"]>[1]) => run(() => controller.updateCondition(node.id, patch));
        const common = { "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : ["in", "not-in"].includes(node.operator) ? `${id}-hint` : undefined };
        const noValue = ["is-empty", "is-not-empty"].includes(node.operator), list = ["in", "not-in"].includes(node.operator);
        return h("fieldset", { key: node.id }, [h("legend", labels.condition(path)),
          label(`${id}-column`, labels.column), h("select", { id: `${id}-column`, value: node.columnId, onChange: (event: Event) => set({ columnId: eventValue(event) }) }, [!policy && h("option", { value: node.columnId, disabled: true }, node.columnId), ...value.columns.map((column) => option(column.id, column.label))]),
          label(`${id}-operator`, labels.operator), h("select", { id: `${id}-operator`, value: node.operator, onChange: (event: Event) => set({ operator: eventValue(event) as FilterOperator }) }, operators.map((operator) => option(operator, labels.describeOperator(operator)))),
          !noValue && [label(`${id}-value`, labels.value), policy?.type === "boolean" && !list ? h("select", { ...common, id: `${id}-value`, disabled: node.nullValue, value: node.input, onChange: (event: Event) => set({ input: eventValue(event) }) }, [option("true", "true"), option("false", "false")]) :
            h("input", { ...common, id: `${id}-value`, type: policy?.type === "date" && !list ? "date" : "text", value: node.input, disabled: node.nullValue, onInput: (event: Event) => set({ input: eventValue(event) }) }),
            node.operator === "between" && [label(`${id}-upper`, labels.upperValue), h("input", { ...common, id: `${id}-upper`, type: policy?.type === "date" ? "date" : "text", value: node.secondInput, onInput: (event: Event) => set({ secondInput: eventValue(event) }) })],
            ["eq", "neq"].includes(node.operator) && check(labels.missing, node.nullValue, (missing) => set({ nullValue: missing })),
            list && h("p", { id: `${id}-hint` }, labels.listHint),
          ], policy?.type === "text" && check(labels.caseSensitive, node.caseSensitive, (sensitive) => set({ caseSensitive: sensitive })),
          error && h("p", { id: `${id}-error`, role: "alert" }, error), button(`${labels.remove} ${labels.condition(path)}`, () => remove(node.id, parentId)),
        ]);
      };
      const group = (node: FilterDraftGroup, path: string, parentId?: string): VNodeChild => {
        const id = `${prefix}-${node.id}`;
        return h("fieldset", { key: node.id }, [h("legend", labels.group(path)), label(`${id}-match`, labels.groupOperator),
          h("select", { id: `${id}-match`, value: node.operator, onChange: (event: Event) => run(() => controller.setGroupOperator(node.id, eventValue(event) as "and" | "or")) }, [option("and", labels.all), option("or", labels.any)]),
          ...node.children.map((child, index) => child.kind === "group" ? group(child, `${path}.${index + 1}`, node.id) : condition(child, `${path}.${index + 1}`, node.id)),
          h("div", { role: "group", "aria-label": labels.group(path) }, [button(labels.addCondition, () => controller.addCondition(node.id), false, `${id}-add`), button(labels.addGroup, () => controller.addGroup(node.id)), parentId && button(`${labels.remove} ${labels.group(path)}`, () => remove(node.id, parentId))]),
        ]);
      };
      const columns = value.allColumns.filter((column) => column.label.toLowerCase().includes(columnQuery.value.toLowerCase())), result = value.facetSearch?.columnId === value.facetColumnId ? value.facetSearch : undefined;
      const applyWidth = (id: string, size: number) => { try { controller.setColumnSize(id, Number(widths.value.get(id) ?? size)); } finally { const next = new Map(widths.value); next.delete(id); widths.value = next; } };
      return h("section", { class: "rowick-filter-panel", "aria-label": labels.panel }, [
        (value.error ?? value.message) && h("p", { role: value.error ? "alert" : "status" }, value.error ?? value.message),
        props.sections.includes("filters") && h("section", { "aria-label": labels.filters }, [h("h2", labels.filters),
          h("div", { role: "group", "aria-label": labels.filters }, [button(labels.apply, controller.apply), button(labels.reset, controller.reset), button(labels.reload, controller.reload)]),
          h("p", { role: "status" }, labels.active(value.activeConditionCount)), h("p", describeActiveFilters(value, labels)), value.stale && h("p", { role: "alert" }, labels.stale), group(value.draft, "1"),
        ]),
        props.sections.includes("columns") && h("section", { "aria-label": labels.columns }, [h("h2", labels.columns), label(`${prefix}-column-search`, labels.columnSearch), h("input", { id: `${prefix}-column-search`, type: "search", value: columnQuery.value, onInput: (event: Event) => { columnQuery.value = eventValue(event); } }),
          columns.length > 100 && h("p", { role: "status" }, labels.limitedColumns(100, columns.length)),
          ...columns.slice(0, 100).map((column) => h("fieldset", { key: column.id }, [h("legend", column.label), check(`${column.label} ${labels.visible}`, column.visible, (visible) => controller.setColumnVisible(column.id, visible), !column.configurable),
            label(`${prefix}-${column.id}-pin`, `${column.label} ${labels.pin}`), h("select", { id: `${prefix}-${column.id}-pin`, value: column.pinned || "none", disabled: !column.configurable, onChange: (event: Event) => run(() => controller.setColumnPinned(column.id, eventValue(event) === "none" ? false : eventValue(event) as "left" | "right")) }, [option("none", labels.unpinned), option("left", labels.left), option("right", labels.right)]),
            label(`${prefix}-${column.id}-width`, `${column.label} ${labels.width}`), h("input", { id: `${prefix}-${column.id}-width`, type: "number", min: 1, disabled: !column.configurable, value: widths.value.get(column.id) ?? String(column.size),
              onInput: (event: Event) => { widths.value = new Map(widths.value).set(column.id, eventValue(event)); }, onBlur: () => run(() => applyWidth(column.id, column.size)), onKeydown: (event: KeyboardEvent) => { if (event.key === "Enter") run(() => applyWidth(column.id, column.size)); if (event.key === "Escape") { const next = new Map(widths.value); next.delete(column.id); widths.value = next; } } }),
            button(`${labels.moveBefore} ${column.label}`, () => controller.moveColumn(column.id, "before"), !column.configurable || value.allColumns[0]?.id === column.id), button(`${labels.moveAfter} ${column.label}`, () => controller.moveColumn(column.id, "after"), !column.configurable || value.allColumns.at(-1)?.id === column.id),
          ])),
        ]),
        props.sections.includes("facets") && h("section", { "aria-label": labels.facets }, [h("h2", labels.facets), label(`${prefix}-facet-column`, labels.facetColumn),
          h("select", { id: `${prefix}-facet-column`, value: value.facetColumnId ?? "", onChange: (event: Event) => run(() => controller.setFacetColumn(eventValue(event))) }, [h("option", { value: "", disabled: true }, labels.column), ...value.columns.map((column) => option(column.id, column.label))]),
          label(`${prefix}-facet-search`, labels.facetSearch), h("input", { id: `${prefix}-facet-search`, type: "search", disabled: !value.facetColumnId, value: value.facetQuery, onInput: (event: Event) => run(() => controller.searchFacets(eventValue(event))) }),
          h("p", labels.facetScope(value.facetScope)), result?.loading && h("p", { role: "status" }, labels.loading), result?.error && h("div", { role: "alert" }, [result.error, button(labels.retry, controller.retryFacets)]),
          (result?.truncated ?? value.facets?.truncated) && h("p", { role: "status" }, labels.truncated), value.facets?.minimum !== undefined && h("p", labels.range(String(value.facets.minimum), String(value.facets.maximum))),
          value.facets?.rowsTruncated && h("p", { role: "status" }, labels.partialCounts),
          h("ul", (result?.values ?? value.facets?.values ?? []).map((facet) => h("li", { key: JSON.stringify(facet.value) }, button(labels.facetCount(facet.value === null ? labels.missingValue : String(facet.value), facet.count), () => controller.useFacet(facet.value))))),
        ]),
        props.sections.includes("views") && h("section", { "aria-label": labels.views }, [h("h2", labels.views), label(`${prefix}-view-name`, labels.viewName), h("input", { id: `${prefix}-view-name`, value: value.viewName, onInput: (event: Event) => run(() => controller.setViewName(eventValue(event))) }),
          label(`${prefix}-view-select`, labels.chooseView), h("select", { id: `${prefix}-view-select`, value: value.selectedViewId, onChange: (event: Event) => run(() => controller.selectView(eventValue(event))) }, [option("", labels.chooseView), ...value.views.map((view) => option(view.id, view.name))]),
          h("div", { role: "group", "aria-label": labels.views }, [button(labels.saveView, controller.saveView), button(labels.restoreView, controller.restoreView, !value.selectedViewId), button(labels.deleteView, controller.deleteView, !value.selectedViewId), button(labels.clearViews, controller.clearViews), button(labels.exportView, controller.exportView)]),
          label(`${prefix}-view-json`, labels.viewJSON), h("textarea", { id: `${prefix}-view-json`, rows: 5, value: value.viewJSON, onInput: (event: Event) => run(() => controller.setViewJSON(eventValue(event))) }), button(labels.importView, controller.importView),
        ]),
      ]);
    };
  },
}) as unknown as DefineComponent<FilterPanelProps>;
