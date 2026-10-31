<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { AnyColumnDef, GridState } from "@rowick/core";
  import { defaultDataSourceLabels, getActiveDataBlock, getDataBlockTotal, getFirstDataBlock, getLastDataBlock, getNextDataBlock, getPreviousDataBlock, getRootDataBlock, getRemoteDataColumns,
    type DataChildScope, type DataSourceActions, type DataSourceController, type DataSourceLabels } from "@rowick/data/server-data";
  import DataGrid from "./DataGrid.svelte";
  export let controller: DataSourceController<unknown, unknown>;
  export let columns: readonly AnyColumnDef<unknown>[];
  export let actions: DataSourceActions | undefined = undefined;
  export let labels: Partial<DataSourceLabels> = {};
  export let getRowLabel: ((row: unknown) => string) | undefined = undefined;
  export let getChildScope: ((row: unknown) => DataChildScope | undefined) | undefined = undefined;
  export let gridStyle: Record<string, string> = { height: "360px" };
  export let gridState: Partial<GridState> | undefined = undefined;
  export let onGridStateChange: ((state: GridState) => void) | undefined = undefined;
  let state = controller.getState(), action = actions?.getState();
  let feedback: { owner: DataSourceController<unknown, unknown>; queryId: string; actions: DataSourceActions | undefined; message: string } | undefined;
  let mounted = false, stopSource = () => {}, stopActions = () => {};
  onMount(() => { mounted = true; });
  $: if (mounted) { stopSource(); state = controller.getState(); stopSource = controller.subscribe(() => { state = controller.getState(); }); }
  $: if (mounted) { stopActions(); action = actions?.getState(); stopActions = actions?.subscribe(() => { action = actions?.getState(); }) ?? (() => {}); }
  onDestroy(() => { stopSource(); stopActions(); });
  $: text = { ...defaultDataSourceLabels, ...labels };
  $: error = feedback?.owner === controller && feedback.queryId === state.queryId && feedback.actions === actions ? feedback.message : undefined;
  $: first = getFirstDataBlock(state);
  $: previous = getPreviousDataBlock(state);
  $: next = getNextDataBlock(state);
  $: last = getLastDataBlock(state);
  $: total = getDataBlockTotal(state);
  $: selected = state.selection.mode === "explicit" ? state.selection.ids : state.selection.excludedIds;
  $: pageIndex = state.activeBlock?.mode === "page" ? state.activeBlock.pageIndex : state.activeBlock?.mode === "offset" ? Math.floor(state.activeBlock.offset / state.activeBlock.limit) : 0;
  $: options = { columns: getRemoteDataColumns(columns, Boolean(onGridStateChange)), data: state.rows, getRowId: controller.getRowId, manualPagination: true, manualSorting: true, manualFiltering: true, manualGrouping: true,
    ...(getActiveDataBlock(state)?.rowOffset !== undefined ? { absoluteRowOffset: getActiveDataBlock(state)!.rowOffset! } : state.activeBlock?.mode === "offset" ? { absoluteRowOffset: state.activeBlock.offset } : state.activeBlock?.mode === "cursor" ? { absoluteRowOffset: null } : {}),
    ...(total.kind === "exact" ? { rowCount: total.count } : {}), hasNextPage: Boolean(next), hasPreviousPage: Boolean(previous),
    state: { ...gridState, rowSelection: Object.fromEntries(state.rows.filter((row) => controller.getIsRowSelected(controller.getRowId(row))).map((row) => [controller.getRowId(row), true])), allRowsSelected: false,
      pagination: { pageIndex, pageSize: state.activeBlock?.limit ?? 100 } },
    onStateChange: (value: GridState) => run(() => { controller.setLoadedSelection(state.rows.map(controller.getRowId), value); onGridStateChange?.(value); }) };
  function run(task: () => unknown) {
    const owner = controller, queryId = owner.getState().queryId, actionOwner = actions;
    const failed = (failure: unknown) => { feedback = { owner, queryId, actions: actionOwner, message: failure instanceof Error ? failure.message : "Action failed" }; };
    feedback = undefined; try { void Promise.resolve(task()).catch(failed); } catch (failure) { failed(failure); }
  }
  function runAction(kind: "bulk" | "export") { if (actions) run(() => actions?.run(kind)); }
  function retryAction() { if (actions) run(actions.retry); }
</script>
<section aria-label={text.panel}>
  <div role="group" aria-label={text.panel}>
    <button type="button" disabled={!first} on:click={() => run(() => first && controller.load(first))}>{text.first}</button>
    <button type="button" disabled={!previous} on:click={() => run(() => previous && controller.load(previous))}>{text.previous}</button>
    <button type="button" disabled={!next} on:click={() => run(() => next && controller.load(next))}>{text.next}</button>
    <button type="button" disabled={!last} on:click={() => run(() => last && controller.load(last))}>{text.last}</button>
    <button type="button" on:click={() => run(controller.refresh)}>{text.refresh}</button>
    {#if state.status === "error"}<button type="button" on:click={() => run(() => controller.retry())}>{text.retry}</button>{/if}
    <button type="button" disabled={!state.loadingCount && !state.queuedCount} on:click={() => controller.cancel()}>{text.cancel}</button>
    {#if state.activeBlock?.scope}<button type="button" on:click={() => run(() => { const root = getRootDataBlock(state); return root && controller.load(root); })}>{text.root}</button>{/if}
  </div>
  <p role="status">{text.summary(state.rows.length, state.cachedRowCount, state.blocks.length, total)}</p>
  {#if state.needsRefresh}<p role="status">{text.stale}</p>{/if}
  {#if state.status === "loading"}<p role="status">{text.loading}</p>{/if}
  {#if error !== undefined || state.status === "error"}<p role="alert">{error ?? (state.error instanceof Error ? state.error.message : "Read failed")}</p>{/if}
  <div role="group" aria-label={text.selectAll}>
    <button type="button" on:click={() => controller.selectAllMatching()}>{text.selectAll}</button>
    <button type="button" on:click={() => controller.clearSelection()}>{text.clearSelection}</button>
    {#if actions && action?.available.bulk}<button type="button" disabled={action.status === "pending" || state.needsRefresh} on:click={() => runAction("bulk")}>{text.bulk}</button>{/if}
    {#if actions && action?.available.export}<button type="button" disabled={action.status === "pending" || state.needsRefresh} on:click={() => runAction("export")}>{text.export}</button>{/if}
    {#if actions && action?.canRetry}<button type="button" on:click={retryAction}>{text.retryAction}</button>{/if}
  </div>
  <p role="status">{text.selection(state.selection.mode, selected.length)}</p>
  {#if action?.result}<p role="status">{action.result.message}</p>{/if}
  {#if action?.submittedSelection}<p role="status">{text.submittedSelection(action.submittedSelection.mode, action.submittedSelection.idCount)}</p>{/if}
  {#if action?.status === "error" || action?.status === "cancelled"}<p role="alert">{action.error instanceof Error ? action.error.message : "Operation failed"}</p>{/if}
  <DataGrid ariaLabel={text.grid} {options} rowSelectionControls rowVirtualization loading={state.status === "loading"}
    error={state.status === "error" && !state.rows.length} onRetry={() => { void controller.retry(); }} style={gridStyle} />
  {#if getChildScope}<div role="group" aria-label="Child blocks">{#each state.rows as row (controller.getRowId(row))}{@const scope = getChildScope(row)}
    {#if scope}<button type="button" on:click={() => run(() => controller.load({ mode: "offset", offset: 0, limit: state.activeBlock?.limit ?? 100, scope }))}>{text.children(getRowLabel?.(row) ?? controller.getRowId(row))}</button>{/if}
  {/each}</div>{/if}
</section>
