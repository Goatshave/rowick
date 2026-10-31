import { FilterScalar, FilterExpression, FilterColumnPolicy, GridState, Grid, FilterOperator } from '@rowick/core';

interface FacetValue {
    readonly value: FilterScalar;
    readonly count: number;
}
interface FacetResult {
    readonly values: readonly FacetValue[];
    readonly matchedRowCount: number;
    readonly scannedRowCount: number;
    readonly invalidValueCount: number;
    readonly distinctCountAtLeast: number;
    readonly truncated: boolean;
    readonly rowsTruncated: boolean;
    readonly valuesTruncated: boolean;
    readonly minimum: FilterScalar | undefined;
    readonly maximum: FilterScalar | undefined;
}
/** Removes target conditions, pruning empty groups. The remaining tree keeps its operators. */
declare function excludeFacetColumn(expression: FilterExpression | null, columnId: string): FilterExpression;
declare function calculateFacets<TData>(rows: readonly TData[], columns: readonly FilterColumnPolicy[], columnId: string, getValue: (row: TData, columnId: string) => unknown, options?: {
    expression?: FilterExpression | null;
    excludeOwnConditions?: boolean;
    maxValues?: number;
    maxRows?: number;
    query?: string;
}): FacetResult;
interface FacetSearchRequest {
    readonly columnId: string;
    readonly query: string;
    readonly expression: FilterExpression;
    readonly limit: number;
    readonly signal: AbortSignal;
    readonly contextKey: string;
}
interface FacetSearchState {
    readonly columnId: string | undefined;
    readonly query: string;
    readonly loading: boolean;
    readonly values: readonly FacetValue[];
    readonly truncated: boolean;
    readonly error: string | undefined;
}
interface FacetSearchController {
    getState: () => FacetSearchState;
    search: (columnId: string, query: string, expression: FilterExpression | null) => Promise<void>;
    retry: () => Promise<void> | null;
    invalidate: () => void;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
/** One active result set/request, same-query dedupe, abort, timeout and context fences. */
declare function createFacetSearchController(options: {
    columns: readonly FilterColumnPolicy[];
    search: (request: FacetSearchRequest) => Promise<{
        values: readonly FacetValue[];
        truncated?: boolean;
    }>;
    getContextKey?: () => string;
    maxValues?: number;
    timeoutMs?: number;
}): FacetSearchController;

interface SavedViewLayout {
    readonly columnVisibility: Readonly<GridState["columnVisibility"]>;
    readonly columnSizing: Readonly<GridState["columnSizing"]>;
    readonly columnOrder: readonly string[];
    readonly columnPinning: {
        readonly left: readonly string[];
        readonly right: readonly string[];
    };
}
interface SavedViewQuery {
    readonly sorting: readonly Readonly<GridState["sorting"][number]>[];
    readonly columnFilters: readonly Readonly<GridState["columnFilters"][number]>[];
    readonly globalFilter: string;
    readonly grouping: readonly string[];
    readonly filterExpression: FilterExpression | null;
}
interface SavedGridView {
    readonly version: 1;
    readonly id: string;
    readonly name: string;
    readonly preferences: {
        readonly version: 1;
        readonly density: "compact" | "standard" | "comfortable";
        readonly state: SavedViewLayout;
    };
    readonly query: SavedViewQuery;
    readonly pageSize: number;
}
interface SavedViewMigration {
    readonly fromVersion: number;
    readonly toVersion: number;
    readonly migrate: (input: Readonly<Record<string, unknown>>) => unknown;
}
interface SavedViewSchema {
    readonly columnIds: readonly string[];
    readonly filterColumns: readonly FilterColumnPolicy[];
    readonly sortableColumnIds?: readonly string[];
    readonly groupableColumnIds?: readonly string[];
    readonly migrations?: readonly SavedViewMigration[];
}
declare function getSavedViewSchema<TData>(grid: Grid<TData>): SavedViewSchema;
/** Strict schema validation: a removed filter column rejects the whole restore. */
declare function validateSavedGridView(input: unknown, schema: SavedViewSchema): SavedGridView;
declare function createSavedGridView<TData>(grid: Grid<TData>, options: {
    id: string;
    name: string;
    density?: SavedGridView["preferences"]["density"];
}): SavedGridView;
declare function applySavedGridView<TData>(grid: Grid<TData>, input: unknown, options?: {
    migrations?: readonly SavedViewMigration[];
    canConfigureColumn?: (id: string) => boolean;
}): SavedGridView;
declare function serializeSavedGridView(view: unknown, schema: SavedViewSchema): string;
declare function parseSavedGridView(value: string, schema: SavedViewSchema): SavedGridView;
/** Imports the existing primitive preferences v1 without changing the current query. */
declare function importLayoutPreferencesView<TData>(grid: Grid<TData>, preferences: unknown, id: string, name: string): SavedGridView;

type FilterPanelSection = "filters" | "columns" | "facets" | "views";
interface FilterPanelLabels {
    panel: string;
    filters: string;
    columns: string;
    facets: string;
    views: string;
    apply: string;
    reset: string;
    reload: string;
    addCondition: string;
    addGroup: string;
    remove: string;
    group: (path: string) => string;
    condition: (path: string) => string;
    groupOperator: string;
    all: string;
    any: string;
    column: string;
    operator: string;
    value: string;
    upperValue: string;
    missing: string;
    caseSensitive: string;
    listHint: string;
    active: (count: number) => string;
    stale: string;
    visible: string;
    pin: string;
    width: string;
    unpinned: string;
    left: string;
    right: string;
    moveBefore: string;
    moveAfter: string;
    columnSearch: string;
    limitedColumns: (shown: number, total: number) => string;
    facetColumn: string;
    facetSearch: string;
    loading: string;
    retry: string;
    facetScope: (scope: string) => string;
    facetCount: (value: string, count: number) => string;
    truncated: string;
    missingValue: string;
    range: (minimum: string, maximum: string) => string;
    partialCounts: string;
    viewName: string;
    chooseView: string;
    saveView: string;
    restoreView: string;
    deleteView: string;
    clearViews: string;
    exportView: string;
    importView: string;
    viewJSON: string;
    describeOperator: (operator: FilterOperator) => string;
}
declare const defaultFilterPanelLabels: FilterPanelLabels;
declare function describeActiveFilters(state: FilterPanelState, labels?: FilterPanelLabels): string;

interface FilterDraftCondition {
    readonly kind: "condition";
    readonly id: string;
    readonly columnId: string;
    readonly operator: FilterOperator;
    readonly input: string;
    readonly secondInput: string;
    readonly nullValue: boolean;
    readonly caseSensitive: boolean;
}
interface FilterDraftGroup {
    readonly kind: "group";
    readonly id: string;
    readonly operator: "and" | "or";
    readonly children: readonly FilterDraftNode[];
}
type FilterDraftNode = FilterDraftCondition | FilterDraftGroup;
interface FilterPanelColumn extends FilterColumnPolicy {
    readonly label: string;
    readonly visible: boolean;
    readonly configurable: boolean;
    readonly pinned: "left" | "right" | false;
    readonly size: number;
}
interface FilterPanelState {
    readonly draft: FilterDraftGroup;
    readonly dirty: boolean;
    readonly stale: boolean;
    readonly columns: readonly FilterPanelColumn[];
    readonly allColumns: readonly Readonly<{
        id: string;
        label: string;
        visible: boolean;
        configurable: boolean;
        pinned: "left" | "right" | false;
        size: number;
    }>[];
    readonly errors: Readonly<Record<string, string>>;
    readonly error: string | undefined;
    readonly message: string | undefined;
    readonly activeConditionCount: number;
    readonly activeExpression: FilterExpression | null;
    readonly facetColumnId: string | undefined;
    readonly facetQuery: string;
    readonly facets: FacetResult | undefined;
    readonly facetSearch: FacetSearchState | undefined;
    readonly facetScope: "client" | "loaded" | "server";
    readonly views: readonly SavedGridView[];
    readonly viewName: string;
    readonly selectedViewId: string;
    readonly viewJSON: string;
}
interface FilterPanelStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
interface FilterPanelOptions<TData> {
    readonly grid: Grid<TData>;
    readonly getColumnLabel?: (id: string) => string;
    readonly canConfigureColumn?: (id: string) => boolean;
    readonly getDensity?: () => SavedGridView["preferences"]["density"];
    readonly onDensityChange?: (density: SavedGridView["preferences"]["density"]) => void;
    readonly storage?: FilterPanelStorage;
    readonly storageKey?: string;
    readonly maxViews?: number;
    readonly viewMigrations?: readonly SavedViewMigration[];
    readonly facetSearch?: (request: FacetSearchRequest) => Promise<{
        values: readonly FacetValue[];
        truncated?: boolean;
    }>;
    readonly getContextKey?: () => string;
    readonly maxFacetValues?: number;
    readonly maxFacetRows?: number;
    readonly onListenerError?: (error: unknown) => void;
}
interface FilterPanelController {
    getState: () => FilterPanelState;
    addCondition: (groupId: string) => void;
    addGroup: (groupId: string) => void;
    remove: (nodeId: string) => void;
    setGroupOperator: (groupId: string, operator: "and" | "or") => void;
    updateCondition: (nodeId: string, patch: Partial<Pick<FilterDraftCondition, "columnId" | "operator" | "input" | "secondInput" | "nullValue" | "caseSensitive">>) => void;
    apply: () => boolean;
    reset: () => void;
    reload: () => void;
    refresh: () => void;
    setColumnVisible: (id: string, visible: boolean) => void;
    setColumnPinned: (id: string, position: "left" | "right" | false) => void;
    setColumnSize: (id: string, size: number) => void;
    moveColumn: (id: string, direction: "before" | "after") => void;
    setFacetColumn: (id: string) => void;
    searchFacets: (query: string) => Promise<void>;
    retryFacets: () => Promise<void> | null;
    useFacet: (value: FilterScalar) => void;
    setViewName: (name: string) => void;
    selectView: (id: string) => void;
    saveView: () => void;
    restoreView: () => void;
    deleteView: () => void;
    clearViews: () => void;
    setViewJSON: (json: string) => void;
    exportView: () => void;
    importView: () => void;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
/** Shared draft, settings, facets and persistence model. The grid/data owner stays external. */
declare function createFilterPanelController<TData>(options: FilterPanelOptions<TData>): FilterPanelController;

export { type FacetResult, type FacetSearchController, type FacetSearchRequest, type FacetSearchState, type FacetValue, type FilterDraftCondition, type FilterDraftGroup, type FilterDraftNode, type FilterPanelColumn, type FilterPanelController, type FilterPanelLabels, type FilterPanelOptions, type FilterPanelSection, type FilterPanelState, type FilterPanelStorage, type SavedGridView, type SavedViewLayout, type SavedViewMigration, type SavedViewQuery, type SavedViewSchema, applySavedGridView, calculateFacets, createFacetSearchController, createFilterPanelController, createSavedGridView, defaultFilterPanelLabels, describeActiveFilters, excludeFacetColumn, getSavedViewSchema, importLayoutPreferencesView, parseSavedGridView, serializeSavedGridView, validateSavedGridView };
