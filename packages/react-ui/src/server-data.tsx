import { useState, useSyncExternalStore, type CSSProperties } from "react";
import type { AnyColumnDef, GridState } from "@rowick/core";
import { defaultDataSourceLabels, getActiveDataBlock, getDataBlockTotal, getFirstDataBlock, getLastDataBlock, getNextDataBlock, getPreviousDataBlock, getRootDataBlock, getRemoteDataColumns,
  type DataChildScope, type DataSourceActionState, type DataSourceActions, type DataSourceController, type DataSourceLabels } from "@rowick/data/server-data";
import { DataGrid } from "./index";
const noSubscription = (_listener: () => void) => () => {};
const noActionState = () => undefined;
export interface ServerDataPanelProps<TRow, TQuery> {
  controller: DataSourceController<TRow, TQuery>; columns: readonly AnyColumnDef<TRow>[];
  actions?: DataSourceActions; labels?: Partial<DataSourceLabels>; getRowLabel?: (row: TRow) => string;
  getChildScope?: (row: TRow) => DataChildScope | undefined; gridStyle?: CSSProperties;
  gridState?: Partial<GridState>; onGridStateChange?: (state: GridState) => void;
}
export function ServerDataPanel<TRow, TQuery>({ controller, columns, actions, labels: overrides, getRowLabel, getChildScope, gridStyle, gridState, onGridStateChange }: ServerDataPanelProps<TRow, TQuery>) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState), labels = { ...defaultDataSourceLabels, ...overrides };
  const action = useSyncExternalStore<DataSourceActionState | undefined>(actions?.subscribe ?? noSubscription, actions?.getState ?? noActionState, actions?.getState ?? noActionState);
  const [feedback, setFeedback] = useState<{ owner: DataSourceController<TRow, TQuery>; queryId: string; actions: DataSourceActions | undefined; message: string }>();
  const error = feedback?.owner === controller && feedback.queryId === state.queryId && feedback.actions === actions ? feedback.message : undefined;
  const run = (task: () => unknown) => {
    const owner = controller, queryId = state.queryId, actionOwner = actions;
    const failed = (failure: unknown) => setFeedback({ owner, queryId, actions: actionOwner, message: failure instanceof Error ? failure.message : "Action failed" });
    setFeedback(undefined); try { void Promise.resolve(task()).catch(failed); } catch (failure) { failed(failure); }
  };
  const first = getFirstDataBlock(state), previous = getPreviousDataBlock(state), next = getNextDataBlock(state), last = getLastDataBlock(state), total = getDataBlockTotal(state);
  const selected = state.selection.mode === "explicit" ? state.selection.ids : state.selection.excludedIds;
  const updateSelection = (value: GridState) => run(() => { controller.setLoadedSelection(state.rows.map(controller.getRowId), value); onGridStateChange?.(value); });
  const pageIndex = state.activeBlock?.mode === "page" ? state.activeBlock.pageIndex : state.activeBlock?.mode === "offset" ? Math.floor(state.activeBlock.offset / state.activeBlock.limit) : 0;
  return <section aria-label={labels.panel}>
    <div role="group" aria-label={labels.panel}>
      <button type="button" disabled={!first} onClick={() => run(() => first && controller.load(first))}>{labels.first}</button>
      <button type="button" disabled={!previous} onClick={() => run(() => previous && controller.load(previous))}>{labels.previous}</button>
      <button type="button" disabled={!next} onClick={() => run(() => next && controller.load(next))}>{labels.next}</button>
      <button type="button" disabled={!last} onClick={() => run(() => last && controller.load(last))}>{labels.last}</button>
      <button type="button" onClick={() => run(controller.refresh)}>{labels.refresh}</button>
      {state.status === "error" && <button type="button" onClick={() => run(() => controller.retry())}>{labels.retry}</button>}
      <button type="button" disabled={!state.loadingCount && !state.queuedCount} onClick={() => controller.cancel()}>{labels.cancel}</button>
      {state.activeBlock?.scope && <button type="button" onClick={() => run(() => { const root = getRootDataBlock(state); return root && controller.load(root); })}>{labels.root}</button>}
    </div>
    <p role="status">{labels.summary(state.rows.length, state.cachedRowCount, state.blocks.length, total)}</p>
    {state.needsRefresh && <p role="status">{labels.stale}</p>}
    {state.status === "loading" && <p role="status">{labels.loading}</p>}
    {(error !== undefined || state.status === "error") && <p role="alert">{error ?? (state.error instanceof Error ? state.error.message : "Read failed")}</p>}
    <div role="group" aria-label={labels.selectAll}>
      <button type="button" onClick={() => controller.selectAllMatching()}>{labels.selectAll}</button>
      <button type="button" onClick={() => controller.clearSelection()}>{labels.clearSelection}</button>
      {actions && action?.available.bulk && <button type="button" disabled={action.status === "pending" || state.needsRefresh} onClick={() => run(() => actions.run("bulk"))}>{labels.bulk}</button>}
      {actions && action?.available.export && <button type="button" disabled={action.status === "pending" || state.needsRefresh} onClick={() => run(() => actions.run("export"))}>{labels.export}</button>}
      {actions && action?.canRetry && <button type="button" onClick={() => run(actions.retry)}>{labels.retryAction}</button>}
    </div>
    <p role="status">{labels.selection(state.selection.mode, selected.length)}</p>
    {action?.result && <p role="status">{action.result.message}</p>}
    {action?.submittedSelection && <p role="status">{labels.submittedSelection(action.submittedSelection.mode, action.submittedSelection.idCount)}</p>}
    {(action?.status === "error" || action?.status === "cancelled") && <p role="alert">{action.error instanceof Error ? action.error.message : "Operation failed"}</p>}
    <DataGrid ariaLabel={labels.grid} columns={getRemoteDataColumns(columns, Boolean(onGridStateChange))} data={state.rows} getRowId={controller.getRowId} manualPagination manualSorting manualFiltering manualGrouping loading={state.status === "loading"}
      error={state.status === "error" && !state.rows.length} onRetry={() => { void controller.retry(); }}
      {...(getActiveDataBlock(state)?.rowOffset !== undefined ? { absoluteRowOffset: getActiveDataBlock(state)!.rowOffset! } : state.activeBlock?.mode === "offset" ? { absoluteRowOffset: state.activeBlock.offset } : state.activeBlock?.mode === "cursor" ? { absoluteRowOffset: null } : {})}
      {...(total.kind === "exact" ? { rowCount: total.count } : {})} hasNextPage={Boolean(next)} hasPreviousPage={Boolean(previous)}
      state={{ ...gridState, rowSelection: Object.fromEntries(state.rows.filter((row) => controller.getIsRowSelected(controller.getRowId(row))).map((row) => [controller.getRowId(row), true])), allRowsSelected: false,
        pagination: { pageIndex, pageSize: state.activeBlock?.limit ?? 100 } }} onStateChange={updateSelection}
      rowSelectionControls rowVirtualization style={gridStyle ?? { height: "360px" }} />
    {getChildScope && <div role="group" aria-label="Child blocks">{state.rows.flatMap((row) => {
      const scope = getChildScope(row); return scope ? [<button type="button" key={controller.getRowId(row)} onClick={() => run(() => controller.load({ mode: "offset", offset: 0, limit: state.activeBlock?.limit ?? 100, scope }))}>{labels.children(getRowLabel?.(row) ?? controller.getRowId(row))}</button>] : [];
    })}</div>}
  </section>;
}
