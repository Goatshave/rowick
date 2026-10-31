import { GridOptions, Grid, Row, Column, HeaderContext, CellContext, CellEditorContext, CellFillOptions, ClipboardPasteOptions, ClipboardPasteResult, ExportFile } from '@rowick/core';
export { AccessorColumnOptions, AccessorFnColumnDef, AccessorKey, AccessorKeyColumnDef, AnyColumnDef, CellContext, CellCoordinate, CellEditEvent, CellEditEventParams, CellEditHistoryAction, CellEditHistoryState, CellEditOption, CellEditParserContext, CellEditPhase, CellEditValidationContext, CellEditValidationResult, CellEditValidationState, CellEditingState, CellEditorContext, CellFillOptions, CellInteractionEvent, CellInteractionEventParams, CellRange, CellRangeSelectionState, ClipboardCellContext, ClipboardCopyOptions, ClipboardPasteCellContext, ClipboardPasteCommittedCell, ClipboardPasteOptions, ClipboardPasteResult, ClipboardPasteSkippedCell, ClipboardPasteSkippedReason, ClipboardPasteValidationError, Column, ColumnDef, ColumnFilter, ColumnFiltersState, ColumnHelper, ColumnId, ColumnMovePosition, ColumnOrderState, ColumnPinningPosition, ColumnPinningState, ColumnResizeEvent, ColumnResizeEventParams, ColumnResizePhase, ColumnSizingState, ColumnVisibilityState, DisplayColumnDef, ExpandedState, ExportFile, ExportFileOptions, FilterFn, FitColumnsToWidthOptions, Grid, GridCacheDiagnostics, GridCacheDiagnosticsEntry, GridCacheKey, GridOptions, GridState, GroupColumnDef, GroupingState, Header, HeaderContext, HeaderGroup, MoveFocusOptions, PaginationState, Row, RowId, RowInteractionEvent, RowInteractionEventParams, RowModel, RowSelectionCleanupScope, RowSelectionState, SortFn, SortingRule, SortingState, Updater, fitColumnsToWidth } from '@rowick/core';
import { ColumnVirtualizationPrimitiveOptions, GridLocalizationOverrides, GridDensity, RowVirtualizationPrimitiveOptions } from '@rowick/primitives';
export { DEFAULT_GRID_LOCALIZATION, GRID_PREFERENCES_VERSION, GridDensity, GridLocalization, GridLocalizationOverrides, GridPreferences, GridPreferencesMigration, GridPreferencesOptions, GridPreferencesParseOptions, GridPreferencesState, GridPreferencesStorageEnvironmentLike, GridPreferencesStorageLike, createGridLocalization, createGridPreferences, getBrowserGridPreferencesStorage, migrateGridPreferences, parseGridPreferences, readGridPreferences, removeGridPreferences, serializeGridPreferences, writeGridPreferences } from '@rowick/primitives';
export { createColumnHelper, useGrid } from '@rowick/vue';
import { DefineComponent, VNodeChild } from 'vue';

interface DataGridRenderContext<TData> {
    grid: Grid<TData>;
    rows: readonly Row<TData>[];
    visibleColumns: readonly Column<TData, unknown>[];
}
interface DataGridErrorRenderContext<TData> extends DataGridRenderContext<TData> {
    retry: (() => void) | undefined;
}
interface DataGridProps<TData> {
    ariaLabel?: string;
    localization?: GridLocalizationOverrides;
    options: GridOptions<TData>;
    emptyState?: VNodeChild;
    error?: boolean;
    errorState?: VNodeChild;
    onRetry?: () => void;
    loading?: boolean;
    loadingState?: VNodeChild;
    renderToolbar?: (context: DataGridRenderContext<TData>) => VNodeChild;
    renderEmptyState?: (context: DataGridRenderContext<TData>) => VNodeChild;
    renderLoadingState?: (context: DataGridRenderContext<TData>) => VNodeChild;
    renderErrorState?: (context: DataGridErrorRenderContext<TData>) => VNodeChild;
    renderHeader?: (context: HeaderContext<TData, unknown>) => VNodeChild;
    renderCell?: (context: CellContext<TData, unknown>) => VNodeChild;
    renderEditor?: (context: CellEditorContext<TData>) => VNodeChild;
    onGridReady?: GridReadyHandler<TData>;
    getRowClassName?: (row: Row<TData>) => string | undefined;
    getHeaderClassName?: (context: HeaderContext<TData, unknown>) => string | undefined;
    getCellClassName?: (context: CellContext<TData, unknown>) => string | undefined;
    groupingPanel?: boolean;
    quickFilterControl?: boolean;
    rowSelectionControls?: boolean;
    columnVisibilityControls?: boolean;
    density?: GridDensity;
    defaultDensity?: GridDensity;
    densityControl?: boolean;
    onDensityChange?: (density: GridDensity) => void;
    columnFilterControls?: boolean;
    paginationControls?: boolean;
    pageSizeOptions?: readonly number[];
    columnPinningControls?: boolean;
    headerActionMenu?: boolean;
    headerActionMenuItems?: HeaderActionMenuItems<TData>;
    rowVirtualization?: boolean | RowVirtualizationOptions;
    columnVirtualization?: boolean | ColumnVirtualizationOptions;
    cellFillOptions?: Omit<CellFillOptions, "sourceEvent">;
    clipboardPasteOptions?: Omit<ClipboardPasteOptions, "sourceEvent">;
    onClipboardPaste?: (result: ClipboardPasteResult<TData>) => void;
    style?: unknown;
    class?: unknown;
}
type DataGridComponent<TData> = DefineComponent<DataGridProps<TData>>;
type GridReadyHandler<TData> = (grid: Grid<TData>) => void | (() => void);
type RowVirtualizationOptions = RowVirtualizationPrimitiveOptions;
type ColumnVirtualizationOptions = ColumnVirtualizationPrimitiveOptions;
interface HeaderActionMenuActionItem<TData> {
    type?: "action";
    id: string;
    label: string;
    disabled?: boolean;
    onSelect: (context: HeaderActionMenuContext<TData>) => void;
}
interface HeaderActionMenuLabelItem {
    type: "label";
    id: string;
    label: string;
}
interface HeaderActionMenuSeparatorItem {
    type: "separator";
    id: string;
    label?: string;
}
interface HeaderActionMenuCustomItem<TData> {
    type: "custom";
    id: string;
    label?: string;
    render: (context: HeaderActionMenuContext<TData>) => VNodeChild;
}
type HeaderActionMenuItem<TData> = HeaderActionMenuActionItem<TData> | HeaderActionMenuLabelItem | HeaderActionMenuSeparatorItem | HeaderActionMenuCustomItem<TData>;
interface HeaderActionMenuContext<TData> {
    grid: Grid<TData>;
    column: Column<TData, unknown>;
    sortDirection: "asc" | "desc" | false;
    pinningPosition: "left" | "right" | false;
    isGrouped: boolean;
    canMoveLeft: boolean;
    canMoveRight: boolean;
    defaultItems: Array<HeaderActionMenuActionItem<TData>>;
}
type HeaderActionMenuItems<TData> = (context: HeaderActionMenuContext<TData>) => Array<HeaderActionMenuItem<TData> | null | false | undefined>;
declare const DataGrid: DataGridComponent<unknown>;
declare function createDataGrid<TData>(): DataGridComponent<TData>;
declare function downloadExportFile(file: ExportFile): boolean;

export { type ColumnVirtualizationOptions, DataGrid, type DataGridComponent, type DataGridErrorRenderContext, type DataGridProps, type DataGridRenderContext, type GridReadyHandler, type HeaderActionMenuActionItem, type HeaderActionMenuContext, type HeaderActionMenuCustomItem, type HeaderActionMenuItem, type HeaderActionMenuItems, type HeaderActionMenuLabelItem, type HeaderActionMenuSeparatorItem, type RowVirtualizationOptions, createDataGrid, downloadExportFile };
