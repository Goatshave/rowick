import { ServerSelection } from '@rowick/core';

type PivotScalar = string | number | boolean | null;
type PivotOperation = "sum" | "avg" | "min" | "max" | "count" | "distinct-count";
interface PivotField<TData> {
    readonly id: string;
    readonly label: string;
    readonly getValue: (row: TData) => unknown;
}
interface PivotMetric {
    readonly id: string;
    readonly label: string;
    readonly columnId?: string;
    readonly operation: PivotOperation;
}
interface PivotConfiguration {
    readonly version: 1;
    readonly rowAxes: readonly string[];
    readonly columnAxes: readonly string[];
    readonly metrics: readonly PivotMetric[];
    readonly subtotals?: boolean;
    readonly rowTotals?: boolean;
    readonly sort?: readonly {
        readonly axis: "rows" | "columns";
        readonly index: number;
        readonly desc?: boolean;
    }[];
}
interface PivotLimits {
    readonly maxInputRows?: number;
    readonly maxRows?: number;
    readonly maxColumns?: number;
    readonly maxCells?: number;
    readonly maxGroups?: number;
    readonly maxDistinctPerCell?: number;
    readonly maxDistinctValues?: number;
    readonly maxKeyCharacters?: number;
}
interface PivotColumn {
    readonly id: string;
    readonly values: readonly PivotScalar[];
    readonly metric: PivotMetric;
    readonly headers: readonly string[];
    readonly total: boolean;
}
interface PivotRow {
    readonly id: string;
    readonly values: readonly PivotScalar[];
    readonly kind: "data" | "subtotal" | "grand-total";
    readonly depth: number;
    readonly cells: Readonly<Record<string, PivotScalar>>;
}
interface PivotResult {
    readonly configuration: PivotConfiguration;
    readonly columns: readonly PivotColumn[];
    readonly rows: readonly PivotRow[];
    readonly grandTotal: PivotRow;
    readonly inputRows: number;
    readonly groupCount: number;
    readonly cellCount: number;
}
/** Produces an immutable, schema-checked saved pivot configuration. */
declare function validatePivotConfiguration<TData>(input: unknown, fields: readonly PivotField<TData>[]): PivotConfiguration;
declare function serializePivotConfiguration<TData>(configuration: unknown, fields: readonly PivotField<TData>[]): string;
declare function parsePivotConfiguration<TData>(serialized: string, fields: readonly PivotField<TData>[]): PivotConfiguration;
/** Bounded client pivot. Supply filtered rows; no backing row data is retained. */
declare function createPivot<TData>(rows: Iterable<TData>, fields: readonly PivotField<TData>[], configuration: unknown, limits?: PivotLimits): PivotResult;

type ExportCellType = "text" | "number" | "boolean" | "decimal" | "date" | "datetime";
type AnalyticsExportValue = string | number | boolean | null;
interface AnalyticsExportCell {
    readonly value: AnalyticsExportValue;
    readonly type: ExportCellType;
    readonly format?: string;
}
interface AnalyticsExportColumn<TData> {
    readonly id: string;
    readonly label: string;
    readonly headers?: readonly string[];
    readonly type?: ExportCellType;
    readonly format?: string;
    readonly sensitive?: boolean;
    readonly exportable?: boolean;
    readonly getValue: (row: TData) => unknown;
}
interface ExportMerge {
    readonly startRow: number;
    readonly startColumn: number;
    readonly rowSpan: number;
    readonly columnSpan: number;
}
type AnalyticsExportScope = "all" | "filtered" | "page" | "selection" | "pivot";
interface AnalyticsExportDocument {
    readonly title: string;
    readonly scope: AnalyticsExportScope;
    readonly columns: readonly {
        readonly id: string;
        readonly label: string;
        readonly headers: readonly string[];
    }[];
    readonly headers: readonly (readonly string[])[];
    readonly rows: readonly (readonly AnalyticsExportCell[])[];
    readonly merges: readonly ExportMerge[];
}
interface AnalyticsExportArtifact {
    readonly filename: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array;
}
interface AnalyticsExporterContext {
    readonly signal: AbortSignal;
    readonly progress: (fraction: number) => void;
}
type AnalyticsExporter = (document: AnalyticsExportDocument, context: AnalyticsExporterContext) => AnalyticsExportArtifact | Promise<AnalyticsExportArtifact>;
interface AnalyticsExportSource<TData> {
    readonly rows: Iterable<TData> | AsyncIterable<TData>;
    readonly columns: readonly AnalyticsExportColumn<TData>[];
    readonly scope: AnalyticsExportScope;
    readonly totalRows?: number;
    readonly revision?: string;
    readonly getCurrentRevision?: () => string;
    /** Merges use final exported column coordinates and include the header offset. */
    readonly merges?: readonly ExportMerge[];
}
interface AnalyticsExportOptions<TData> {
    readonly exporter: AnalyticsExporter;
    readonly title?: string;
    readonly maxRows?: number;
    readonly maxColumns?: number;
    readonly maxCells?: number;
    readonly maxTextCharacters?: number;
    readonly maxArtifactBytes?: number;
    readonly includeSensitive?: boolean;
    readonly authorizeColumn?: (column: AnalyticsExportColumn<TData>) => boolean;
    readonly authorizeRow?: (row: TData) => boolean;
    readonly onListenerError?: (error: unknown) => void;
}
interface AnalyticsExportState {
    readonly status: "idle" | "collecting" | "encoding" | "success" | "cancelled" | "error";
    readonly rowsProcessed: number;
    readonly totalRows: number | undefined;
    readonly progress: number | undefined;
    readonly error: string | undefined;
}
interface AnalyticsExportJob {
    getState: () => AnalyticsExportState;
    start: () => Promise<AnalyticsExportArtifact>;
    cancel: () => void;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
declare function assertExportText(value: string): void;
/** Numeric coordinates are zero-based and cover header + data rows. */
declare function validateExportMerges(merges: readonly ExportMerge[], rowCount: number, columnCount: number, headerRows?: number): readonly ExportMerge[];
/** Reject partial/noncontiguous spans when selection, filtering or sensitive columns split a merge. */
declare function resolveExportMerges(spans: readonly {
    readonly start: {
        readonly rowId: string;
        readonly columnId: string;
    };
    readonly rowSpan: number;
    readonly columnSpan: number;
}[], sourceRowIds: readonly string[], sourceColumnIds: readonly string[], exportedRowIds: readonly string[], exportedColumnIds: readonly string[], headerRows?: number): readonly ExportMerge[];
declare function createAnalyticsExportJob<TData>(source: AnalyticsExportSource<TData>, options: AnalyticsExportOptions<TData>): AnalyticsExportJob;
declare function createDelimitedExporter(options?: {
    readonly delimiter?: "," | "\t";
    readonly filename?: string;
    readonly protectFormulaText?: boolean;
}): AnalyticsExporter;
declare function sanitizeExportFilename(name: string, extension: string): string;
/** Standalone HTML can be downloaded/opened and printed without popup permissions. */
declare const createPrintExporter: (options?: {
    readonly filename?: string;
    readonly orientation?: "portrait" | "landscape";
}) => AnalyticsExporter;
interface ServerAnalyticsExportRequest<TQuery> {
    readonly version: 1;
    readonly queryKey: string;
    readonly query: Readonly<TQuery>;
    readonly selection: ServerSelection<TQuery> | null;
    readonly columns: readonly string[];
    readonly format: "csv" | "tsv" | "xlsx";
    readonly maxRows: number;
}
/** Captures a bounded immutable request. The endpoint must independently authorize and resolve live data. */
declare function createServerAnalyticsExportRequest<TQuery>(options: {
    queryKey: string;
    query: TQuery;
    selection?: ServerSelection<TQuery>;
    columns: readonly string[];
    allowedColumns: readonly string[];
    format: "csv" | "tsv" | "xlsx";
    maxRows?: number;
}): ServerAnalyticsExportRequest<TQuery>;

interface AnalyticsControllerState {
    readonly draft: PivotConfiguration;
    readonly result: PivotResult;
    readonly pageIndex: number;
    readonly pageCount: number;
    readonly pageRows: readonly PivotRow[];
    readonly columnPageIndex: number;
    readonly columnPageCount: number;
    readonly pageColumns: readonly PivotColumn[];
    readonly error: string | undefined;
    readonly message: string | undefined;
    readonly exportState: AnalyticsExportState | undefined;
    readonly formats: readonly string[];
}
interface AnalyticsController<TData> {
    readonly fields: readonly Pick<PivotField<TData>, "id" | "label">[];
    getState: () => AnalyticsControllerState;
    setAxes: (axis: "rows" | "columns", ids: readonly string[]) => boolean;
    setMetrics: (metrics: readonly PivotMetric[]) => boolean;
    setTotals: (subtotals: boolean, rowTotals: boolean) => boolean;
    setSorting: (sort: NonNullable<PivotConfiguration["sort"]>) => boolean;
    apply: () => boolean;
    reset: () => boolean;
    refresh: () => boolean;
    saveView: () => boolean;
    restoreView: () => boolean;
    setPage: (index: number) => void;
    setColumnPage: (index: number) => void;
    export: (format: string, source?: "pivot" | "records") => Promise<AnalyticsExportArtifact>;
    cancelExport: () => void;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
interface AnalyticsControllerOptions<TData> {
    readonly fields: readonly PivotField<TData>[];
    /** Return filtered immutable rows. Server datasets must aggregate/export on their server. */
    readonly getRows: () => Iterable<TData>;
    readonly configuration: PivotConfiguration;
    readonly limits?: PivotLimits;
    readonly pageSize?: number;
    readonly columnPageSize?: number;
    readonly exportColumns?: readonly AnalyticsExportColumn<TData>[];
    readonly exporters?: Readonly<Record<string, AnalyticsExporter>>;
    readonly getRevision?: () => string;
    readonly title?: string;
    readonly loadView?: () => string | null;
    readonly saveView?: (serialized: string) => void;
    readonly onArtifact?: (artifact: AnalyticsExportArtifact) => void;
    readonly onListenerError?: (error: unknown) => void;
}
declare function createPivotExportSource<TData>(result: PivotResult, fields: readonly Pick<PivotField<TData>, "id" | "label">[]): AnalyticsExportSource<PivotRow>;
/** Framework-neutral configuration, pagination, saved view and export lifecycle for the optional panel. */
declare function createAnalyticsController<TData>(options: AnalyticsControllerOptions<TData>): AnalyticsController<TData>;

interface AnalyticsLabels {
    panel: string;
    rowAxes: string;
    columnAxes: string;
    metrics: string;
    operation: string;
    valueField: string;
    countRows: string;
    addMetric: string;
    removeMetric: string;
    apply: string;
    reset: string;
    saveView: string;
    restoreView: string;
    subtotals: string;
    rowTotals: string;
    descendingRows: string;
    descendingColumns: string;
    results: string;
    row: string;
    previousRows: string;
    nextRows: string;
    previousColumns: string;
    nextColumns: string;
    exportScope: string;
    pivotScope: string;
    recordScope: string;
    cancelExport: string;
    progress: string;
    export: (format: string) => string;
    summary: (rows: number, columns: number) => string;
    page: (rowPage: number, rowPages: number, columnPage: number, columnPages: number) => string;
    axisOrder: (label: string) => string;
    moveAxis: (axis: "rows" | "columns", label: string, direction: "up" | "down") => string;
    rowLabel: (row: PivotRow) => string;
    exportStatus: (status: string, rows: number) => string;
}
declare const defaultAnalyticsLabels: AnalyticsLabels;
declare const analyticsOperations: readonly ["sum", "avg", "min", "max", "count", "distinct-count"];
declare function updateAnalyticsMetric<TData>(controller: AnalyticsController<TData>, index: number, change: Partial<PivotMetric>): boolean;
declare function addAnalyticsMetric<TData>(controller: AnalyticsController<TData>): boolean;
declare function setAnalyticsAxisSelection<TData>(controller: AnalyticsController<TData>, axis: "rows" | "columns", selected: readonly string[]): boolean;
declare function moveAnalyticsAxis<TData>(controller: AnalyticsController<TData>, axis: "rows" | "columns", index: number, direction: "up" | "down"): boolean;

interface ServerAnalyticsExportHandlerOptions<TQuery, TData> {
    readonly columns: readonly AnalyticsExportColumn<TData>[];
    readonly validateQuery: (input: unknown) => TQuery;
    readonly getQueryKey: (query: Readonly<TQuery>) => string;
    readonly getRows: (query: Readonly<TQuery>, signal: AbortSignal, request: Request, selection: ServerSelection<TQuery> | null) => Iterable<TData> | AsyncIterable<TData> | Promise<Iterable<TData> | AsyncIterable<TData>>;
    readonly getRowId: (row: TData) => string;
    readonly authorize: (request: Request) => boolean | Promise<boolean>;
    readonly authorizeColumn: (column: AnalyticsExportColumn<TData>, request: Request) => boolean;
    readonly authorizeRow: (row: TData, query: Readonly<TQuery>, request: Request) => boolean;
    readonly exporters?: Partial<Readonly<Record<"csv" | "tsv" | "xlsx", AnalyticsExporter>>>;
    readonly includeSensitive?: boolean;
    readonly maxRows?: number;
    readonly maxBytes?: number;
    readonly maxScanRows?: number;
    readonly getRevision?: () => string;
}
/** Fetch/Next.js/Nuxt/SvelteKit compatible endpoint. Every request is reauthorized against server-owned policies. */
declare function createServerAnalyticsExportHandler<TQuery, TData>(options: ServerAnalyticsExportHandlerOptions<TQuery, TData>): (request: Request) => Promise<Response>;

export { type AnalyticsController, type AnalyticsControllerOptions, type AnalyticsControllerState, type AnalyticsExportArtifact, type AnalyticsExportCell, type AnalyticsExportColumn, type AnalyticsExportDocument, type AnalyticsExportJob, type AnalyticsExportOptions, type AnalyticsExportScope, type AnalyticsExportSource, type AnalyticsExportState, type AnalyticsExportValue, type AnalyticsExporter, type AnalyticsExporterContext, type AnalyticsLabels, type ExportCellType, type ExportMerge, type PivotColumn, type PivotConfiguration, type PivotField, type PivotLimits, type PivotMetric, type PivotOperation, type PivotResult, type PivotRow, type PivotScalar, type ServerAnalyticsExportHandlerOptions, type ServerAnalyticsExportRequest, addAnalyticsMetric, analyticsOperations, assertExportText, createAnalyticsController, createAnalyticsExportJob, createDelimitedExporter, createPivot, createPivotExportSource, createPrintExporter, createServerAnalyticsExportHandler, createServerAnalyticsExportRequest, defaultAnalyticsLabels, moveAnalyticsAxis, parsePivotConfiguration, resolveExportMerges, sanitizeExportFilename, serializePivotConfiguration, setAnalyticsAxisSelection, updateAnalyticsMetric, validateExportMerges, validatePivotConfiguration };
