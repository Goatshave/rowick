import {
  createGrid,
  type Grid,
  type GridOptions,
  type GridSelector,
  type GridSelectorSubscriptionOptions,
  type GridState,
  type Updater,
} from "@rowick/core";
import { get, readable, type Readable } from "svelte/store";

export interface SvelteGrid<TData> {
  grid: Grid<TData>;
  state: Readable<GridState>;
  setOptions: (updater: Updater<GridOptions<TData>>, options?: { notify?: boolean }) => void;
  dispose: () => void;
}

export type SvelteGridOptions<TData> = GridOptions<TData> | Readable<GridOptions<TData>>;
export type SvelteGridSelectorOptions<TSelected> = Pick<GridSelectorSubscriptionOptions<TSelected>, "equalityFn">;

export function createGridStore<TData>(options: SvelteGridOptions<TData>): SvelteGrid<TData> {
  const optionStore = isReadable(options) ? options : null;
  const initialOptions: GridOptions<TData> = optionStore ? get(optionStore) : (options as GridOptions<TData>);
  const grid = createGrid(initialOptions);
  let disposed = false;
  let snapshot = grid.getState();
  let unsubscribeGrid: (() => void) | undefined;
  let setState: ((state: GridState) => void) | null = null;
  const unsubscribeOptions = optionStore?.subscribe((nextOptions) => {
    grid.setOptions(nextOptions, { notify: false });
    grid.reconcileState();
    snapshot = grid.getState();
    setState?.(grid.getState());
  });
  const state = readable(snapshot, (set) => {
    if (disposed) { set(snapshot); return; }
    setState = set;
    snapshot = grid.getState();
    set(snapshot);
    unsubscribeGrid = grid.subscribe(() => { snapshot = grid.getState(); set(snapshot); });

    return () => {
      setState = null;
      unsubscribeGrid?.();
      unsubscribeGrid = undefined;
    };
  });
  const setOptions: SvelteGrid<TData>["setOptions"] = (updater, setOptionsOptions) => {
    grid.setOptions(updater, setOptionsOptions);
    if (!disposed) { snapshot = grid.getState(); setState?.(snapshot); }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsubscribeOptions?.();
    unsubscribeGrid?.();
    unsubscribeGrid = undefined;
    setState = null;
  };

  return {
    grid,
    state,
    setOptions,
    dispose,
  };
}

export function createGridSelectorStore<TData, TSelected>(
  grid: Grid<TData>,
  selector: GridSelector<TData, TSelected>,
  options?: SvelteGridSelectorOptions<TSelected>,
): Readable<TSelected> {
  return readable(selector(grid), (set) => grid.subscribeSelector(selector, set, options));
}

function isReadable<TValue>(value: unknown): value is Readable<TValue> {
  return typeof value === "object" && value !== null && "subscribe" in value && typeof value.subscribe === "function";
}

export { createGrid };
export { createColumnHelper, fitColumnsToWidth } from "@rowick/core";
export type {
  AccessorKey,
  AccessorColumnOptions,
  AccessorFnColumnDef,
  AccessorKeyColumnDef,
  AnyColumnDef,
  CellContext,
  CellEditorContext,
  CellCoordinate,
  CellEditEvent,
  CellEditEventParams,
  CellEditHistoryAction,
  CellEditHistoryState,
  CellEditPhase,
  CellEditParserContext,
  CellEditingState,
  CellFillOptions,
  CellInteractionEvent,
  CellInteractionEventParams,
  CellRange,
  CellRangeSelectionState,
  ClipboardCellContext,
  ClipboardCopyOptions,
  ClipboardPasteOptions,
  Column,
  ColumnDef,
  ColumnHelper,
  ColumnFilter,
  ColumnFiltersState,
  ColumnId,
  ColumnMovePosition,
  ColumnOrderState,
  ColumnPinningPosition,
  ColumnPinningState,
  ColumnResizeEvent,
  ColumnResizeEventParams,
  ColumnResizePhase,
  ColumnSizingState,
  ColumnVisibilityState,
  DisplayColumnDef,
  ExpandedState,
  FitColumnsToWidthOptions,
  FilterFn,
  Grid,
  GridCacheDiagnostics,
  GridCacheDiagnosticsEntry,
  GridCacheKey,
  GridOptions,
  GridSelector,
  GridSelectorListener,
  GridSelectorSubscriptionOptions,
  GridState,
  GroupingState,
  Header,
  HeaderGroup,
  GroupColumnDef,
  HeaderContext,
  MoveFocusOptions,
  PaginationState,
  Row,
  RowId,
  RowInteractionEvent,
  RowInteractionEventParams,
  RowModel,
  RowSelectionCleanupScope,
  RowSelectionState,
  SortFn,
  SortingRule,
  SortingState,
  Updater,
} from "@rowick/core";
