import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { addAnalyticsMetric, analyticsOperations, defaultAnalyticsLabels, moveAnalyticsAxis, setAnalyticsAxisSelection, updateAnalyticsMetric, type AnalyticsController, type AnalyticsLabels, type PivotOperation } from "@rowick/data/analytics";
export interface AnalyticsPanelProps<TData> { controller: AnalyticsController<TData>; labels?: Partial<AnalyticsLabels>; }
export function AnalyticsPanel<TData>({ controller, labels: overrides }: AnalyticsPanelProps<TData>) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState), labels = { ...defaultAnalyticsLabels, ...overrides }, id = useId();
  const [error, setError] = useState<string>(), [scope, setScope] = useState<"pivot" | "records">("pivot");
  const sequence = useRef(0); useEffect(() => () => { sequence.current++; }, [controller]);
  const run = (action: () => unknown) => { const intent = ++sequence.current; setError(undefined); try { void Promise.resolve(action()).catch((failure: unknown) => { if (sequence.current === intent) setError(failure instanceof Error ? failure.message : "Analytics action failed"); }); } catch (failure) { if (sequence.current === intent) setError(failure instanceof Error ? failure.message : "Analytics action failed"); } };
  const axes = (axis: "rows" | "columns", label: string) => {
    const selected = axis === "rows" ? state.draft.rowAxes : state.draft.columnAxes, other = axis === "rows" ? state.draft.columnAxes : state.draft.rowAxes;
    return <div><label>{label}<select aria-label={label} multiple size={Math.max(1, Math.min(5, controller.fields.length))} value={[...selected]} onChange={(event) => run(() => setAnalyticsAxisSelection(controller, axis, Array.from(event.currentTarget.selectedOptions, (option) => option.value)))}>
      {controller.fields.map((field) => <option key={field.id} value={field.id} disabled={other.includes(field.id)}>{field.label}</option>)}
    </select></label><ol aria-label={labels.axisOrder(label)}>{selected.map((fieldId, index) => { const name = controller.fields.find((field) => field.id === fieldId)?.label ?? fieldId; return <li key={fieldId}>{name}
      <button type="button" aria-label={labels.moveAxis(axis, name, "up")} disabled={index === 0} onClick={() => run(() => moveAnalyticsAxis(controller, axis, index, "up"))}>↑</button>
      <button type="button" aria-label={labels.moveAxis(axis, name, "down")} disabled={index + 1 === selected.length} onClick={() => run(() => moveAnalyticsAxis(controller, axis, index, "down"))}>↓</button>
    </li>; })}</ol></div>;
  };
  const busy = state.exportState && ["idle", "collecting", "encoding"].includes(state.exportState.status);
  return <section className="rowick-analytics" aria-label={labels.panel}>
    <fieldset><legend>{labels.panel}</legend>{axes("rows", labels.rowAxes)}{axes("columns", labels.columnAxes)}
      <fieldset><legend>{labels.metrics}</legend>{state.draft.metrics.map((metric, index) => <fieldset key={metric.id}><legend>{metric.label}</legend>
        <label>{labels.valueField}<select aria-label={labels.valueField} value={metric.columnId ?? ""} onChange={(event) => run(() => updateAnalyticsMetric(controller, index, { columnId: event.currentTarget.value }))}>
          {!metric.columnId && <option value="">{labels.countRows}</option>}{controller.fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
        </select></label>
        <label>{labels.operation}<select aria-label={labels.operation} value={metric.operation} onChange={(event) => run(() => updateAnalyticsMetric(controller, index, { operation: event.currentTarget.value as PivotOperation }))}>
          {analyticsOperations.map((operation) => <option key={operation} value={operation} disabled={operation !== "count" && !metric.columnId}>{operation}</option>)}
        </select></label>
        <button type="button" disabled={state.draft.metrics.length === 1} onClick={() => run(() => controller.setMetrics(state.draft.metrics.filter((_, position) => position !== index)))}>{labels.removeMetric}</button>
      </fieldset>)}<button type="button" disabled={state.draft.metrics.length >= 16} onClick={() => run(() => addAnalyticsMetric(controller))}>{labels.addMetric}</button></fieldset>
      <label><input type="checkbox" checked={state.draft.subtotals === true} onChange={(event) => run(() => controller.setTotals(event.currentTarget.checked, state.draft.rowTotals === true))} />{labels.subtotals}</label>
      <label><input type="checkbox" checked={state.draft.rowTotals === true} onChange={(event) => run(() => controller.setTotals(state.draft.subtotals === true, event.currentTarget.checked))} />{labels.rowTotals}</label>
      {(["rows", "columns"] as const).map((axis) => <label key={axis}><input type="checkbox" disabled={!(axis === "rows" ? state.draft.rowAxes : state.draft.columnAxes).length} checked={state.draft.sort?.some((rule) => rule.axis === axis && rule.index === 0 && rule.desc) ?? false}
        onChange={(event) => run(() => controller.setSorting([...(state.draft.sort ?? []).filter((rule) => rule.axis !== axis), { axis, index: 0, desc: event.currentTarget.checked }]))} />{axis === "rows" ? labels.descendingRows : labels.descendingColumns}</label>)}
      <div role="group" aria-label={labels.panel}><button type="button" onClick={() => run(controller.apply)}>{labels.apply}</button><button type="button" onClick={() => run(controller.reset)}>{labels.reset}</button>
        <button type="button" onClick={() => run(controller.saveView)}>{labels.saveView}</button><button type="button" onClick={() => run(controller.restoreView)}>{labels.restoreView}</button></div>
    </fieldset>
    {(error ?? state.error) && <p role="alert">{error ?? state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <p role="status">{labels.summary(state.result.rows.length, state.result.columns.length)}</p>
    <table><caption>{labels.results}</caption><thead><tr><th scope="col">{labels.row}</th>{state.pageColumns.map((column) => <th key={column.id} scope="col">{column.headers.join(" / ")}</th>)}</tr></thead>
      <tbody>{state.pageRows.map((row) => <tr key={row.id}><th scope="row">{labels.rowLabel(row)}</th>{state.pageColumns.map((column) => <td key={column.id}>{row.cells[column.id] === null ? "" : String(row.cells[column.id])}</td>)}</tr>)}</tbody></table>
    <div role="group" aria-label={labels.results}><button type="button" disabled={!state.pageIndex} onClick={() => controller.setPage(state.pageIndex - 1)}>{labels.previousRows}</button>
      <button type="button" disabled={state.pageIndex + 1 >= state.pageCount} onClick={() => controller.setPage(state.pageIndex + 1)}>{labels.nextRows}</button>
      <button type="button" disabled={!state.columnPageIndex} onClick={() => controller.setColumnPage(state.columnPageIndex - 1)}>{labels.previousColumns}</button>
      <button type="button" disabled={state.columnPageIndex + 1 >= state.columnPageCount} onClick={() => controller.setColumnPage(state.columnPageIndex + 1)}>{labels.nextColumns}</button>
      <span>{labels.page(state.pageIndex + 1, state.pageCount, state.columnPageIndex + 1, state.columnPageCount)}</span></div>
    <label htmlFor={`${id}-scope`}>{labels.exportScope}</label><select id={`${id}-scope`} value={scope} disabled={Boolean(busy)} onChange={(event) => setScope(event.currentTarget.value as "pivot" | "records")}><option value="pivot">{labels.pivotScope}</option><option value="records">{labels.recordScope}</option></select>
    <div role="group" aria-label={labels.exportScope}>{state.formats.map((format) => <button type="button" key={format} disabled={Boolean(busy)} onClick={() => run(() => controller.export(format, scope))}>{labels.export(format)}</button>)}
      <button type="button" disabled={!busy} onClick={() => controller.cancelExport()}>{labels.cancelExport}</button></div>
    {state.exportState && <div><progress aria-label={labels.progress} max={1} value={state.exportState.progress} /><p role="status">{labels.exportStatus(state.exportState.status, state.exportState.rowsProcessed)}</p></div>}
  </section>;
}
