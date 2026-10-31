import { ServerSelection, GridState, AnyColumnDef } from '@rowick/core';

type DataTotal = {
    readonly kind: "exact";
    readonly count: number;
} | {
    readonly kind: "unknown";
};
type DataScalar = string | number | boolean | null;
type DataPosition = {
    readonly mode: "page";
    readonly pageIndex: number;
} | {
    readonly mode: "offset";
    readonly offset: number;
} | {
    readonly mode: "cursor";
    readonly cursor: string | null;
};
interface DataChildScope {
    readonly kind: "group" | "tree";
    readonly parentId: string;
    readonly path?: readonly DataScalar[];
}
type DataBlockRequest = DataPosition & {
    readonly limit: number;
    readonly scope?: DataChildScope;
};
interface DataRequest<TQuery> {
    readonly query: Readonly<TQuery>;
    readonly queryKey: string;
    readonly queryId: string;
    readonly generation: number;
    readonly block: DataBlockRequest;
    readonly signal: AbortSignal;
}
interface DataResponse<TRow> {
    /** Echo the request's identity; never reuse a result across query universes. */
    readonly queryId: string;
    readonly rows: readonly TRow[];
    readonly total: DataTotal;
    readonly revision: number;
    readonly hasNext: boolean;
    readonly nextCursor?: string | null;
    readonly previousCursor?: string | null;
    /** Absolute zero-based row rank; omission is unknown for a cursor window. */
    readonly rowOffset?: number;
    readonly aggregates?: Readonly<Record<string, DataScalar>>;
}
interface DataSource<TRow, TQuery> {
    getRows: (request: DataRequest<TQuery>) => Promise<DataResponse<TRow>>;
}
interface CachedDataBlock<TRow> extends DataResponse<TRow> {
    readonly key: string;
    readonly request: DataBlockRequest;
    readonly stale: boolean;
}
type DataLoadResult<TRow> = {
    readonly status: "loaded" | "cached";
    readonly block: CachedDataBlock<TRow>;
} | {
    readonly status: "cancelled" | "stale";
} | {
    readonly status: "error";
    readonly error: unknown;
};
interface DataSelectionSnapshot<TQuery> {
    readonly version: 1;
    readonly queryId: string;
    readonly selection: ServerSelection<TQuery>;
    readonly observedRevision: number | null;
    readonly evaluation: "live-query";
    readonly operationId: string;
    readonly maxRows: number;
}
type DataLiveEvent<TRow> = {
    readonly queryId: string;
    readonly revision: number;
    readonly total?: DataTotal;
    readonly aggregates?: Readonly<Record<string, DataScalar>>;
} & ({
    readonly type: "update";
    readonly row: TRow;
    readonly impact: "patch" | "query";
} | {
    readonly type: "add";
    readonly row: TRow;
} | {
    readonly type: "delete";
    readonly id: string;
});
interface DataSourceState<TRow, TQuery> {
    readonly query: Readonly<TQuery>;
    readonly queryKey: string;
    readonly queryId: string;
    readonly generation: number;
    readonly status: "idle" | "loading" | "ready" | "error" | "stale";
    readonly activeBlock: DataBlockRequest | null;
    readonly blocks: readonly CachedDataBlock<TRow>[];
    readonly rows: readonly TRow[];
    readonly total: DataTotal;
    readonly revision: number | null;
    readonly aggregates: Readonly<Record<string, DataScalar>>;
    readonly needsRefresh: boolean;
    readonly loadingCount: number;
    readonly queuedCount: number;
    readonly cachedRowCount: number;
    readonly error: unknown;
    readonly selection: ServerSelection<TQuery>;
}
/** Transport-neutral cache data. Products own row serialization and revival. */
interface DataSourceHydration<TRow> {
    readonly version: 1;
    readonly queryKey: string;
    readonly revision: number | null;
    readonly total: DataTotal;
    readonly aggregates: Readonly<Record<string, DataScalar>>;
    readonly activeBlock: DataBlockRequest | null;
    readonly blocks: readonly {
        readonly request: DataBlockRequest;
        readonly response: Omit<DataResponse<TRow>, "queryId">;
    }[];
}
interface DataSourceControllerOptions<TRow, TQuery> {
    source: DataSource<TRow, TQuery>;
    query: TQuery;
    getRowId: (row: TRow) => string;
    getRowRevision?: (row: TRow) => number;
    maxBlocks?: number;
    maxCachedRows?: number;
    maxBlockSize?: number;
    concurrency?: number;
    maxQueuedRequests?: number;
    maxSignalWaiters?: number;
    maxSelectionIds?: number;
    timeoutMs?: number;
    createQueryId?: () => string;
    createOperationId?: () => string;
    onListenerError?: (error: unknown) => void;
    initialData?: DataSourceHydration<TRow>;
}
interface DataSourceController<TRow, TQuery> {
    getState: () => DataSourceState<TRow, TQuery>;
    getRowId: (row: TRow) => string;
    setQuery: (query: TQuery) => boolean;
    load: (block: DataBlockRequest, options?: {
        force?: boolean;
        activate?: boolean;
        signal?: AbortSignal;
    }) => Promise<DataLoadResult<TRow>>;
    getBlock: (block: DataBlockRequest) => CachedDataBlock<TRow> | undefined;
    getLoadedRows: () => readonly TRow[];
    retry: (block?: DataBlockRequest) => Promise<DataLoadResult<TRow>> | null;
    refresh: () => Promise<DataLoadResult<TRow>> | null;
    invalidate: (block?: DataBlockRequest) => void;
    cancel: (block?: DataBlockRequest) => void;
    applyLive: (event: DataLiveEvent<TRow>) => "applied" | "ignored" | "resync-required";
    setRowSelected: (id: string, selected: boolean) => void;
    setLoadedSelection: (ids: readonly string[], state: Pick<GridState, "rowSelection" | "allRowsSelected">) => void;
    getIsRowSelected: (id: string) => boolean;
    selectAllMatching: () => void;
    clearSelection: () => void;
    captureSelection: (options?: {
        operationId?: string;
        maxRows?: number;
    }) => DataSelectionSnapshot<TQuery>;
    isSelectionCurrent: (snapshot: DataSelectionSnapshot<TQuery>) => boolean;
    dehydrate: () => DataSourceHydration<TRow>;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
/** Captures finite JSON, sorts keys, rejects getters/cycles and bounds query work. */
declare function captureDataQuery<TQuery>(query: TQuery): {
    query: Readonly<TQuery>;
    key: string;
};
declare function validateDataBlockRequest(input: unknown, maximum?: number): DataBlockRequest;
/** Bounded optional remote row model. Source transport and server authority remain external. */
declare function createDataSourceController<TRow, TQuery>(options: DataSourceControllerOptions<TRow, TQuery>): DataSourceController<TRow, TQuery>;

declare function getActiveDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): CachedDataBlock<TRow> | undefined;
declare function getDataBlockTotal<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataTotal;
declare function getNextDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null;
declare function getPreviousDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null;
declare function getFirstDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null;
declare function getLastDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null;
declare function getRootDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null;
interface DataSourceLabels {
    panel: string;
    grid: string;
    first: string;
    previous: string;
    next: string;
    last: string;
    refresh: string;
    retry: string;
    cancel: string;
    root: string;
    selectAll: string;
    clearSelection: string;
    bulk: string;
    export: string;
    retryAction: string;
    stale: string;
    loading: string;
    unknownTotal: string;
    children: (label: string) => string;
    summary: (loaded: number, cached: number, blocks: number, total: DataTotal) => string;
    selection: (mode: "explicit" | "all-matching", count: number) => string;
    submittedSelection: (mode: "explicit" | "all-matching", count: number) => string;
}
declare const defaultDataSourceLabels: DataSourceLabels;

type DataActionKind = "bulk" | "export";
interface DataActionContext {
    readonly signal: AbortSignal;
}
interface DataActionResult {
    readonly message: string;
}
interface DataSourceActionState {
    readonly status: "idle" | "pending" | "success" | "error" | "cancelled";
    readonly kind: DataActionKind | null;
    readonly result: DataActionResult | null;
    readonly error: unknown;
    readonly canRetry: boolean;
    readonly available: Readonly<{
        bulk: boolean;
        export: boolean;
    }>;
    readonly submittedSelection: Readonly<{
        mode: "explicit" | "all-matching";
        idCount: number;
        operationId: string;
    }> | null;
}
interface DataSourceActions {
    getState: () => DataSourceActionState;
    run: (kind: DataActionKind) => Promise<DataSourceActionState>;
    retry: () => Promise<DataSourceActionState> | null;
    cancel: () => void;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
/** Shares the same captured selection for bulk/export and retains IDs on retry. */
declare function createDataSourceActions<TRow, TQuery>(controller: DataSourceController<TRow, TQuery>, options: {
    bulk?: (selection: DataSelectionSnapshot<TQuery>, context: DataActionContext) => Promise<DataActionResult>;
    export?: (selection: DataSelectionSnapshot<TQuery>, context: DataActionContext) => Promise<DataActionResult>;
    maxRows?: number;
    timeoutMs?: number;
    onListenerError?: (error: unknown) => void;
}): DataSourceActions;

/** Remote panels never edit/locally sort a loaded subset by accident. */
declare function getRemoteDataColumns<TRow>(columns: readonly AnyColumnDef<TRow>[], queryControls: boolean): readonly AnyColumnDef<TRow>[];

export { type CachedDataBlock, type DataActionContext, type DataActionKind, type DataActionResult, type DataBlockRequest, type DataChildScope, type DataLiveEvent, type DataLoadResult, type DataPosition, type DataRequest, type DataResponse, type DataScalar, type DataSelectionSnapshot, type DataSource, type DataSourceActionState, type DataSourceActions, type DataSourceController, type DataSourceControllerOptions, type DataSourceHydration, type DataSourceLabels, type DataSourceState, type DataTotal, captureDataQuery, createDataSourceActions, createDataSourceController, defaultDataSourceLabels, getActiveDataBlock, getDataBlockTotal, getFirstDataBlock, getLastDataBlock, getNextDataBlock, getPreviousDataBlock, getRemoteDataColumns, getRootDataBlock, validateDataBlockRequest };
