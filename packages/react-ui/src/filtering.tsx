import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { defaultFilterPanelLabels, describeActiveFilters, type FilterDraftCondition, type FilterDraftGroup, type FilterDraftNode, type FilterPanelColumn, type FilterPanelController,
  type FilterPanelLabels, type FilterPanelSection, type FilterPanelState } from "@rowick/data/filtering";
import { getFilterOperators, type FilterOperator } from "@rowick/core";
export interface FilterPanelProps { controller: FilterPanelController; labels?: Partial<FilterPanelLabels>; sections?: readonly FilterPanelSection[]; }
export function FilterPanel({ controller, labels: overrides, sections = ["filters", "columns", "facets", "views"] }: FilterPanelProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState), prefix = useId(), [columnQuery, setColumnQuery] = useState("");
  const labels = { ...defaultFilterPanelLabels, ...overrides };
  const run = (operation: () => unknown) => { try { void Promise.resolve(operation()).catch(() => {}); } catch { /* Controller publishes the error. */ } };
  const columns = state.allColumns.filter((column) => column.label.toLowerCase().includes(columnQuery.toLowerCase()));
  const result = state.facetSearch?.columnId === state.facetColumnId ? state.facetSearch : undefined, values = result?.values ?? state.facets?.values ?? [];
  return <section className="rowick-filter-panel" aria-label={labels.panel}>
    {(state.error ?? state.message) && <p role={state.error ? "alert" : "status"}>{state.error ?? state.message}</p>}
    {sections.includes("filters") && <section aria-label={labels.filters}><h2>{labels.filters}</h2>
      <div role="group" aria-label={labels.filters}><button type="button" onClick={() => run(controller.apply)}>{labels.apply}</button><button type="button" onClick={() => run(controller.reset)}>{labels.reset}</button><button type="button" onClick={() => run(controller.reload)}>{labels.reload}</button></div>
      <p role="status">{labels.active(state.activeConditionCount)}</p><p>{describeActiveFilters(state, labels)}</p>
      {state.stale && <p role="alert">{labels.stale}</p>}
      <DraftGroup node={state.draft} path="1" state={state} controller={controller} labels={labels} prefix={prefix} run={run} />
    </section>}
    {sections.includes("columns") && <section aria-label={labels.columns}><h2>{labels.columns}</h2>
      <label htmlFor={`${prefix}-column-search`}>{labels.columnSearch}</label><input id={`${prefix}-column-search`} type="search" value={columnQuery} onChange={(event) => setColumnQuery(event.currentTarget.value)} />
      {columns.length > 100 && <p role="status">{labels.limitedColumns(100, columns.length)}</p>}
      {columns.slice(0, 100).map((column) => <fieldset key={column.id}><legend>{column.label}</legend>
        <label><input type="checkbox" checked={column.visible} disabled={!column.configurable} onChange={(event) => run(() => controller.setColumnVisible(column.id, event.currentTarget.checked))} />{column.label} {labels.visible}</label>
        <label htmlFor={`${prefix}-${column.id}-pin`}>{column.label} {labels.pin}</label><select id={`${prefix}-${column.id}-pin`} disabled={!column.configurable} value={column.pinned || "none"} onChange={(event) => run(() => controller.setColumnPinned(column.id, event.currentTarget.value === "none" ? false : event.currentTarget.value as "left" | "right"))}>
          <option value="none">{labels.unpinned}</option><option value="left">{labels.left}</option><option value="right">{labels.right}</option></select>
        <ColumnWidth column={column} controller={controller} label={`${column.label} ${labels.width}`} run={run} />
        <button type="button" disabled={!column.configurable || state.allColumns[0]?.id === column.id} onClick={() => run(() => controller.moveColumn(column.id, "before"))}>{labels.moveBefore} {column.label}</button>
        <button type="button" disabled={!column.configurable || state.allColumns.at(-1)?.id === column.id} onClick={() => run(() => controller.moveColumn(column.id, "after"))}>{labels.moveAfter} {column.label}</button>
      </fieldset>)}
    </section>}
    {sections.includes("facets") && <section aria-label={labels.facets}><h2>{labels.facets}</h2>
      <label htmlFor={`${prefix}-facet-column`}>{labels.facetColumn}</label><select id={`${prefix}-facet-column`} value={state.facetColumnId ?? ""} onChange={(event) => run(() => controller.setFacetColumn(event.currentTarget.value))}><option value="" disabled>{labels.column}</option>{state.columns.map((column) => <option value={column.id} key={column.id}>{column.label}</option>)}</select>
      <label htmlFor={`${prefix}-facet-search`}>{labels.facetSearch}</label><input id={`${prefix}-facet-search`} type="search" disabled={!state.facetColumnId} value={state.facetQuery} onChange={(event) => run(() => controller.searchFacets(event.currentTarget.value))} />
      <p>{labels.facetScope(state.facetScope)}</p>{result?.loading && <p role="status">{labels.loading}</p>}
      {result?.error && <div role="alert">{result.error}<button type="button" onClick={() => run(controller.retryFacets)}>{labels.retry}</button></div>}
      {(result?.truncated ?? state.facets?.truncated) && <p role="status">{labels.truncated}</p>}
      {state.facets?.rowsTruncated && <p role="status">{labels.partialCounts}</p>}
      {state.facets?.minimum !== undefined && <p>{labels.range(String(state.facets.minimum), String(state.facets.maximum))}</p>}
      <ul>{values.map((facet) => <li key={JSON.stringify(facet.value)}><button type="button" onClick={() => run(() => controller.useFacet(facet.value))}>{labels.facetCount(facet.value === null ? labels.missingValue : String(facet.value), facet.count)}</button></li>)}</ul>
    </section>}
    {sections.includes("views") && <section aria-label={labels.views}><h2>{labels.views}</h2>
      <label htmlFor={`${prefix}-view-name`}>{labels.viewName}</label><input id={`${prefix}-view-name`} value={state.viewName} onChange={(event) => run(() => controller.setViewName(event.currentTarget.value))} />
      <label htmlFor={`${prefix}-view-select`}>{labels.chooseView}</label><select id={`${prefix}-view-select`} value={state.selectedViewId} onChange={(event) => run(() => controller.selectView(event.currentTarget.value))}><option value="">{labels.chooseView}</option>{state.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select>
      <div role="group" aria-label={labels.views}><button type="button" onClick={() => run(controller.saveView)}>{labels.saveView}</button><button type="button" disabled={!state.selectedViewId} onClick={() => run(controller.restoreView)}>{labels.restoreView}</button><button type="button" disabled={!state.selectedViewId} onClick={() => run(controller.deleteView)}>{labels.deleteView}</button><button type="button" onClick={() => run(controller.clearViews)}>{labels.clearViews}</button><button type="button" onClick={() => run(controller.exportView)}>{labels.exportView}</button></div>
      <label htmlFor={`${prefix}-view-json`}>{labels.viewJSON}</label><textarea id={`${prefix}-view-json`} rows={5} value={state.viewJSON} onChange={(event) => run(() => controller.setViewJSON(event.currentTarget.value))} /><button type="button" onClick={() => run(controller.importView)}>{labels.importView}</button>
    </section>}
  </section>;
}
type DraftProps = { state: FilterPanelState; controller: FilterPanelController; labels: FilterPanelLabels; prefix: string; run: (operation: () => unknown) => void; };
function DraftGroup({ node, path, parentId, ...props }: DraftProps & { node: FilterDraftGroup; path: string; parentId?: string }) {
  const { controller, labels, prefix, run } = props, id = `${prefix}-${node.id}`;
  const remove = () => { controller.remove(node.id); requestAnimationFrame(() => document.getElementById(`${prefix}-${parentId}-add`)?.focus()); };
  return <fieldset><legend>{labels.group(path)}</legend><label htmlFor={`${id}-match`}>{labels.groupOperator}</label><select id={`${id}-match`} value={node.operator} onChange={(event) => run(() => controller.setGroupOperator(node.id, event.currentTarget.value as "and" | "or"))}><option value="and">{labels.all}</option><option value="or">{labels.any}</option></select>
    {node.children.map((child, index) => child.kind === "group" ? <DraftGroup key={child.id} {...props} node={child} path={`${path}.${index + 1}`} parentId={node.id} /> : <DraftCondition key={child.id} {...props} node={child} path={`${path}.${index + 1}`} parentId={node.id} />)}
    <div role="group" aria-label={labels.group(path)}><button id={`${id}-add`} type="button" onClick={() => run(() => controller.addCondition(node.id))}>{labels.addCondition}</button><button type="button" onClick={() => run(() => controller.addGroup(node.id))}>{labels.addGroup}</button>{parentId && <button type="button" onClick={() => run(remove)}>{labels.remove} {labels.group(path)}</button>}</div>
  </fieldset>;
}
function DraftCondition({ node, path, parentId, state, controller, labels, prefix, run }: DraftProps & { node: FilterDraftCondition; path: string; parentId: string }) {
  const id = `${prefix}-${node.id}`, policy = state.columns.find((column) => column.id === node.columnId), operators = policy ? policy.operators ?? getFilterOperators(policy.type) : [], error = state.errors[node.id];
  const set = (patch: Parameters<FilterPanelController["updateCondition"]>[1]) => run(() => controller.updateCondition(node.id, patch));
  const inputProps = { "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : node.operator === "in" || node.operator === "not-in" ? `${id}-hint` : undefined };
  return <fieldset><legend>{labels.condition(path)}</legend>
    <label htmlFor={`${id}-column`}>{labels.column}</label><select id={`${id}-column`} value={node.columnId} onChange={(event) => set({ columnId: event.currentTarget.value })}>{!policy && <option value={node.columnId} disabled>{node.columnId}</option>}{state.columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select>
    <label htmlFor={`${id}-operator`}>{labels.operator}</label><select id={`${id}-operator`} value={node.operator} onChange={(event) => set({ operator: event.currentTarget.value as FilterOperator })}>{operators.map((operator) => <option key={operator} value={operator}>{labels.describeOperator(operator)}</option>)}</select>
    {node.operator !== "is-empty" && node.operator !== "is-not-empty" && <>
      <label htmlFor={`${id}-value`}>{labels.value}</label>{policy?.type === "boolean" && !["in", "not-in"].includes(node.operator) ? <select {...inputProps} id={`${id}-value`} disabled={node.nullValue} value={node.input} onChange={(event) => set({ input: event.currentTarget.value })}><option value="true">true</option><option value="false">false</option></select> : <input {...inputProps} id={`${id}-value`} type={policy?.type === "date" && !["in", "not-in"].includes(node.operator) ? "date" : "text"} disabled={node.nullValue} value={node.input} onChange={(event) => set({ input: event.currentTarget.value })} />}
      {node.operator === "between" && <><label htmlFor={`${id}-upper`}>{labels.upperValue}</label><input {...inputProps} id={`${id}-upper`} type={policy?.type === "date" ? "date" : "text"} value={node.secondInput} onChange={(event) => set({ secondInput: event.currentTarget.value })} /></>}
      {["eq", "neq"].includes(node.operator) && <label><input type="checkbox" checked={node.nullValue} onChange={(event) => set({ nullValue: event.currentTarget.checked })} />{labels.missing}</label>}
      {["in", "not-in"].includes(node.operator) && <p id={`${id}-hint`}>{labels.listHint}</p>}
    </>}
    {policy?.type === "text" && <label><input type="checkbox" checked={node.caseSensitive} onChange={(event) => set({ caseSensitive: event.currentTarget.checked })} />{labels.caseSensitive}</label>}
    {error && <p id={`${id}-error`} role="alert">{error}</p>}
    <button type="button" onClick={() => run(() => { controller.remove(node.id); requestAnimationFrame(() => document.getElementById(`${prefix}-${parentId}-add`)?.focus()); })}>{labels.remove} {labels.condition(path)}</button>
  </fieldset>;
}
function ColumnWidth({ column, controller, label, run }: { column: FilterPanelState["allColumns"][number]; controller: FilterPanelController; label: string; run: (operation: () => unknown) => void }) {
  const [value, setValue] = useState(String(column.size)); useEffect(() => setValue(String(column.size)), [column.size]);
  const apply = () => run(() => { try { controller.setColumnSize(column.id, Number(value)); } finally { setValue(String(controller.getState().allColumns.find((entry) => entry.id === column.id)?.size ?? column.size)); } });
  return <label>{label}<input type="number" min={1} disabled={!column.configurable} value={value} onChange={(event) => setValue(event.currentTarget.value)} onBlur={apply} onKeyDown={(event) => { if (event.key === "Enter") apply(); if (event.key === "Escape") setValue(String(column.size)); }} /></label>;
}
