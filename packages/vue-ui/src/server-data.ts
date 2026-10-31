import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type DefineComponent, type PropType } from "vue";
import type { AnyColumnDef, GridState } from "@rowick/core";
import { defaultDataSourceLabels, getActiveDataBlock, getDataBlockTotal, getFirstDataBlock, getLastDataBlock, getNextDataBlock, getPreviousDataBlock, getRootDataBlock, getRemoteDataColumns,
  type DataChildScope, type DataSourceActions, type DataSourceController, type DataSourceLabels } from "@rowick/data/server-data";
import { createDataGrid } from "./index";
export interface ServerDataPanelProps<TRow, TQuery> {
  controller: DataSourceController<TRow, TQuery>; columns: readonly AnyColumnDef<TRow>[];
  actions?: DataSourceActions; labels?: Partial<DataSourceLabels>; getRowLabel?: (row: TRow) => string;
  getChildScope?: (row: TRow) => DataChildScope | undefined; gridStyle?: Record<string, string>;
  gridState?: Partial<GridState>; onGridStateChange?: (state: GridState) => void;
}
export function createServerDataPanel<TRow, TQuery>(): DefineComponent<ServerDataPanelProps<TRow, TQuery>> {
  const Grid = createDataGrid<TRow>();
  return defineComponent({ props: {
    controller: { type: Object as PropType<DataSourceController<TRow, TQuery>>, required: true }, columns: { type: Array as PropType<readonly AnyColumnDef<TRow>[]>, required: true },
    actions: { type: Object as PropType<DataSourceActions>, default: undefined }, labels: { type: Object as PropType<Partial<DataSourceLabels>>, default: undefined },
    getRowLabel: { type: Function as PropType<(row: TRow) => string>, default: undefined }, getChildScope: { type: Function as PropType<(row: TRow) => DataChildScope | undefined>, default: undefined },
    gridStyle: { type: Object as PropType<Record<string, string>>, default: undefined },
    gridState: { type: Object as PropType<Partial<GridState>>, default: undefined }, onGridStateChange: { type: Function as PropType<(state: GridState) => void>, default: undefined },
  }, setup(props) {
    const state = shallowRef(props.controller.getState()), action = shallowRef(props.actions?.getState());
    const feedback = shallowRef<{ owner: DataSourceController<TRow, TQuery>; queryId: string; actions: DataSourceActions | undefined; message: string }>();
    let stopSource = () => {}, stopActions = () => {};
    onMounted(() => {
      watch(() => props.controller, (controller) => { stopSource(); state.value = controller.getState(); stopSource = controller.subscribe(() => { state.value = controller.getState(); }); }, { immediate: true });
      watch(() => props.actions, (actions) => { stopActions(); action.value = actions?.getState(); stopActions = actions?.subscribe(() => { action.value = actions.getState(); }) ?? (() => {}); }, { immediate: true });
    });
    onBeforeUnmount(() => { stopSource(); stopActions(); });
    const run = (task: () => unknown) => {
      const owner = props.controller, queryId = owner.getState().queryId, actionOwner = props.actions;
      const failed = (failure: unknown) => { feedback.value = { owner, queryId, actions: actionOwner, message: failure instanceof Error ? failure.message : "Action failed" }; };
      feedback.value = undefined; try { void Promise.resolve(task()).catch(failed); } catch (failure) { failed(failure); }
    };
    return () => {
      const controller = props.controller, actions = props.actions, current = state.value, labels = { ...defaultDataSourceLabels, ...props.labels };
      const error = feedback.value?.owner === controller && feedback.value.queryId === current.queryId && feedback.value.actions === actions ? feedback.value.message : undefined;
      const first = getFirstDataBlock(current), previous = getPreviousDataBlock(current), next = getNextDataBlock(current), last = getLastDataBlock(current), total = getDataBlockTotal(current);
      const selected = current.selection.mode === "explicit" ? current.selection.ids : current.selection.excludedIds;
      const button = (label: string, task: () => unknown, disabled = false) => h("button", { type: "button", disabled, onClick: () => run(task) }, label);
      const pageIndex = current.activeBlock?.mode === "page" ? current.activeBlock.pageIndex : current.activeBlock?.mode === "offset" ? Math.floor(current.activeBlock.offset / current.activeBlock.limit) : 0;
      return h("section", { "aria-label": labels.panel }, [
        h("div", { role: "group", "aria-label": labels.panel }, [button(labels.first, () => first && controller.load(first), !first), button(labels.previous, () => previous && controller.load(previous), !previous),
          button(labels.next, () => next && controller.load(next), !next), button(labels.last, () => last && controller.load(last), !last), button(labels.refresh, controller.refresh),
          current.status === "error" && button(labels.retry, () => controller.retry()), button(labels.cancel, () => controller.cancel(), !current.loadingCount && !current.queuedCount),
          current.activeBlock?.scope && button(labels.root, () => { const root = getRootDataBlock(current); return root && controller.load(root); })]),
        h("p", { role: "status" }, labels.summary(current.rows.length, current.cachedRowCount, current.blocks.length, total)), current.needsRefresh && h("p", { role: "status" }, labels.stale),
        current.status === "loading" && h("p", { role: "status" }, labels.loading), (error !== undefined || current.status === "error") && h("p", { role: "alert" }, error ?? (current.error instanceof Error ? current.error.message : "Read failed")),
        h("div", { role: "group", "aria-label": labels.selectAll }, [button(labels.selectAll, () => controller.selectAllMatching()), button(labels.clearSelection, () => controller.clearSelection()),
          actions && action.value?.available.bulk && button(labels.bulk, () => actions.run("bulk"), action.value.status === "pending" || current.needsRefresh),
          actions && action.value?.available.export && button(labels.export, () => actions.run("export"), action.value.status === "pending" || current.needsRefresh),
          actions && action.value?.canRetry && button(labels.retryAction, actions.retry)]),
        h("p", { role: "status" }, labels.selection(current.selection.mode, selected.length)), action.value?.result && h("p", { role: "status" }, action.value.result.message),
        action.value?.submittedSelection && h("p", { role: "status" }, labels.submittedSelection(action.value.submittedSelection.mode, action.value.submittedSelection.idCount)),
        (action.value?.status === "error" || action.value?.status === "cancelled") && h("p", { role: "alert" }, action.value.error instanceof Error ? action.value.error.message : "Operation failed"),
        h(Grid, { ariaLabel: labels.grid, options: { columns: getRemoteDataColumns(props.columns, Boolean(props.onGridStateChange)), data: current.rows, getRowId: controller.getRowId, manualPagination: true, manualSorting: true, manualFiltering: true, manualGrouping: true,
          ...(getActiveDataBlock(current)?.rowOffset !== undefined ? { absoluteRowOffset: getActiveDataBlock(current)!.rowOffset! } : current.activeBlock?.mode === "offset" ? { absoluteRowOffset: current.activeBlock.offset } : current.activeBlock?.mode === "cursor" ? { absoluteRowOffset: null } : {}),
          ...(total.kind === "exact" ? { rowCount: total.count } : {}), hasNextPage: Boolean(next), hasPreviousPage: Boolean(previous),
          state: { ...props.gridState, rowSelection: Object.fromEntries(current.rows.filter((row) => controller.getIsRowSelected(controller.getRowId(row))).map((row) => [controller.getRowId(row), true])), allRowsSelected: false,
            pagination: { pageIndex, pageSize: current.activeBlock?.limit ?? 100 } }, onStateChange: (value: GridState) => run(() => { controller.setLoadedSelection(current.rows.map(controller.getRowId), value); props.onGridStateChange?.(value); }) },
          rowSelectionControls: true, rowVirtualization: true, loading: current.status === "loading", error: current.status === "error" && !current.rows.length,
          onRetry: () => { void controller.retry(); }, style: props.gridStyle ?? { height: "360px" } }),
        props.getChildScope && h("div", { role: "group", "aria-label": "Child blocks" }, current.rows.flatMap((row) => { const scope = props.getChildScope!(row); return scope ?
          [button(labels.children(props.getRowLabel?.(row) ?? controller.getRowId(row)), () => controller.load({ mode: "offset", offset: 0, limit: current.activeBlock?.limit ?? 100, scope }))] : []; })),
      ]);
    };
  } }) as unknown as DefineComponent<ServerDataPanelProps<TRow, TQuery>>;
}
export const ServerDataPanel = createServerDataPanel<unknown, unknown>();
