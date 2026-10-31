<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { addAnalyticsMetric, analyticsOperations, defaultAnalyticsLabels, moveAnalyticsAxis, setAnalyticsAxisSelection, updateAnalyticsMetric, type AnalyticsController, type AnalyticsLabels, type PivotOperation } from "@rowick/data/analytics";
  export let controller: AnalyticsController<unknown>;
  export let labels: Partial<AnalyticsLabels> = {};
  let state = controller.getState(), error: string | undefined, scope: "pivot" | "records" = "pivot", mounted = false;
  let stop = () => {}, sequence = 0;
  const invalidate = () => { sequence++; };
  onMount(() => { mounted = true; }); onDestroy(() => { invalidate(); stop(); });
  $: if (mounted) { invalidate(); stop(); state = controller.getState(); stop = controller.subscribe(() => { state = controller.getState(); }); }
  $: text = { ...defaultAnalyticsLabels, ...labels };
  $: busy = state.exportState && ["idle", "collecting", "encoding"].includes(state.exportState.status);
  function run(action: () => unknown) { const intent = ++sequence; error = undefined; try { void Promise.resolve(action()).catch((failure: unknown) => { if (sequence === intent) error = failure instanceof Error ? failure.message : "Analytics action failed"; }); } catch (failure) { if (sequence === intent) error = failure instanceof Error ? failure.message : "Analytics action failed"; } }
  function changeOperation(index: number, event: Event) { run(() => updateAnalyticsMetric(controller, index, { operation: (event.currentTarget as HTMLSelectElement).value as PivotOperation })); }
  function changeScope(event: Event) { const value = (event.currentTarget as HTMLSelectElement).value; if (value === "pivot" || value === "records") scope = value; }
  function axes(axis: "rows" | "columns", event: Event) { setAnalyticsAxisSelection(controller, axis, Array.from((event.target as HTMLSelectElement).selectedOptions, (option) => option.value)); }
  function sort(axis: "rows" | "columns", desc: boolean) { controller.setSorting([...(state.draft.sort ?? []).filter((rule) => rule.axis !== axis), { axis, index: 0, desc }]); }
</script>
<section class="rowick-analytics" aria-label={text.panel}>
  <fieldset><legend>{text.panel}</legend>
    <label>{text.rowAxes}<select aria-label={text.rowAxes} multiple size={Math.max(1, Math.min(5, controller.fields.length))} value={state.draft.rowAxes} on:change={(event) => run(() => axes("rows", event))}>
      {#each controller.fields as field (field.id)}<option value={field.id} disabled={state.draft.columnAxes.includes(field.id)}>{field.label}</option>{/each}
    </select></label>
    <ol aria-label={text.axisOrder(text.rowAxes)}>{#each state.draft.rowAxes as id, index (id)}{@const name = controller.fields.find((field) => field.id === id)?.label ?? id}<li>{name}<button type="button" aria-label={text.moveAxis("rows", name, "up")} disabled={!index} on:click={() => run(() => moveAnalyticsAxis(controller, "rows", index, "up"))}>↑</button><button type="button" aria-label={text.moveAxis("rows", name, "down")} disabled={index + 1 === state.draft.rowAxes.length} on:click={() => run(() => moveAnalyticsAxis(controller, "rows", index, "down"))}>↓</button></li>{/each}</ol>
    <label>{text.columnAxes}<select aria-label={text.columnAxes} multiple size={Math.max(1, Math.min(5, controller.fields.length))} value={state.draft.columnAxes} on:change={(event) => run(() => axes("columns", event))}>
      {#each controller.fields as field (field.id)}<option value={field.id} disabled={state.draft.rowAxes.includes(field.id)}>{field.label}</option>{/each}
    </select></label>
    <ol aria-label={text.axisOrder(text.columnAxes)}>{#each state.draft.columnAxes as id, index (id)}{@const name = controller.fields.find((field) => field.id === id)?.label ?? id}<li>{name}<button type="button" aria-label={text.moveAxis("columns", name, "up")} disabled={!index} on:click={() => run(() => moveAnalyticsAxis(controller, "columns", index, "up"))}>↑</button><button type="button" aria-label={text.moveAxis("columns", name, "down")} disabled={index + 1 === state.draft.columnAxes.length} on:click={() => run(() => moveAnalyticsAxis(controller, "columns", index, "down"))}>↓</button></li>{/each}</ol>
    <fieldset><legend>{text.metrics}</legend>
      {#each state.draft.metrics as metric, index (metric.id)}
        <fieldset><legend>{metric.label}</legend>
          <label>{text.valueField}<select aria-label={text.valueField} value={metric.columnId ?? ""} on:change={(event) => run(() => updateAnalyticsMetric(controller, index, { columnId: event.currentTarget.value }))}>
            {#if !metric.columnId}<option value="">{text.countRows}</option>{/if}{#each controller.fields as field (field.id)}<option value={field.id}>{field.label}</option>{/each}
          </select></label>
            <label>{text.operation}<select aria-label={text.operation} value={metric.operation} on:change={(event) => changeOperation(index, event)}>
            {#each analyticsOperations as operation}<option value={operation} disabled={operation !== "count" && !metric.columnId}>{operation}</option>{/each}
          </select></label>
          <button type="button" disabled={state.draft.metrics.length === 1} on:click={() => run(() => controller.setMetrics(state.draft.metrics.filter((_, position) => position !== index)))}>{text.removeMetric}</button>
        </fieldset>
      {/each}
      <button type="button" disabled={state.draft.metrics.length >= 16} on:click={() => run(() => addAnalyticsMetric(controller))}>{text.addMetric}</button>
    </fieldset>
    <label><input type="checkbox" checked={state.draft.subtotals === true} on:change={(event) => run(() => controller.setTotals(event.currentTarget.checked, state.draft.rowTotals === true))} />{text.subtotals}</label>
    <label><input type="checkbox" checked={state.draft.rowTotals === true} on:change={(event) => run(() => controller.setTotals(state.draft.subtotals === true, event.currentTarget.checked))} />{text.rowTotals}</label>
    <label><input type="checkbox" disabled={!state.draft.rowAxes.length} checked={state.draft.sort?.some((rule) => rule.axis === "rows" && rule.index === 0 && rule.desc) ?? false} on:change={(event) => run(() => sort("rows", event.currentTarget.checked))} />{text.descendingRows}</label>
    <label><input type="checkbox" disabled={!state.draft.columnAxes.length} checked={state.draft.sort?.some((rule) => rule.axis === "columns" && rule.index === 0 && rule.desc) ?? false} on:change={(event) => run(() => sort("columns", event.currentTarget.checked))} />{text.descendingColumns}</label>
    <div role="group" aria-label={text.panel}><button type="button" on:click={() => run(controller.apply)}>{text.apply}</button><button type="button" on:click={() => run(controller.reset)}>{text.reset}</button><button type="button" on:click={() => run(controller.saveView)}>{text.saveView}</button><button type="button" on:click={() => run(controller.restoreView)}>{text.restoreView}</button></div>
  </fieldset>
  {#if error ?? state.error}<p role="alert">{error ?? state.error}</p>{/if}{#if state.message}<p role="status">{state.message}</p>{/if}
  <p role="status">{text.summary(state.result.rows.length, state.result.columns.length)}</p>
  <table><caption>{text.results}</caption><thead><tr><th scope="col">{text.row}</th>{#each state.pageColumns as column (column.id)}<th scope="col">{column.headers.join(" / ")}</th>{/each}</tr></thead>
    <tbody>{#each state.pageRows as row (row.id)}<tr><th scope="row">{text.rowLabel(row)}</th>{#each state.pageColumns as column (column.id)}<td>{row.cells[column.id] === null ? "" : String(row.cells[column.id])}</td>{/each}</tr>{/each}</tbody></table>
  <div role="group" aria-label={text.results}>
    <button type="button" disabled={!state.pageIndex} on:click={() => controller.setPage(state.pageIndex - 1)}>{text.previousRows}</button><button type="button" disabled={state.pageIndex + 1 >= state.pageCount} on:click={() => controller.setPage(state.pageIndex + 1)}>{text.nextRows}</button>
    <button type="button" disabled={!state.columnPageIndex} on:click={() => controller.setColumnPage(state.columnPageIndex - 1)}>{text.previousColumns}</button><button type="button" disabled={state.columnPageIndex + 1 >= state.columnPageCount} on:click={() => controller.setColumnPage(state.columnPageIndex + 1)}>{text.nextColumns}</button>
    <span>{text.page(state.pageIndex + 1, state.pageCount, state.columnPageIndex + 1, state.columnPageCount)}</span>
  </div>
  <label>{text.exportScope}<select aria-label={text.exportScope} value={scope} disabled={Boolean(busy)} on:change={changeScope}><option value="pivot">{text.pivotScope}</option><option value="records">{text.recordScope}</option></select></label>
  <div role="group" aria-label={text.exportScope}>{#each state.formats as format}<button type="button" disabled={Boolean(busy)} on:click={() => run(() => controller.export(format, scope))}>{text.export(format)}</button>{/each}<button type="button" disabled={!busy} on:click={() => controller.cancelExport()}>{text.cancelExport}</button></div>
  {#if state.exportState}<div><progress aria-label={text.progress} max={1} value={state.exportState.progress}></progress><p role="status">{text.exportStatus(state.exportState.status, state.exportState.rowsProcessed)}</p></div>{/if}
</section>
