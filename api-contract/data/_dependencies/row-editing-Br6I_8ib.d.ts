import { RowId, ColumnId, ServerMutationFailure } from '@rowick/core';

type RowDraftStatus = "editing" | "queued" | "validating" | "saving" | "validation-error" | "conflict" | "error";
type RowDraftValues = Readonly<Record<ColumnId, unknown>>;
type RowDraftErrors = Readonly<Record<ColumnId, string>>;
interface RowDraft {
    readonly rowId: RowId;
    readonly values: RowDraftValues;
    readonly errors: RowDraftErrors;
    readonly status: RowDraftStatus;
    readonly message: string | undefined;
    readonly dirty: boolean;
    readonly pendingCount: number;
}
interface RowEditingState {
    readonly rows: readonly RowDraft[];
    readonly dirtyRowCount: number;
    readonly pendingCount: number;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
}
interface RowEditContext<TData> {
    readonly rowId: RowId;
    readonly original: TData;
    readonly candidate: TData;
    readonly values: RowDraftValues;
    readonly version: unknown;
    readonly operationId: string;
    readonly signal: AbortSignal;
}
type RowValidationResult = {
    valid: true;
} | {
    valid: false;
    errors?: RowDraftErrors;
    message?: string;
};
interface RowEditingOptions<TData> {
    /** Must read current authoritative data, independently of projected drafts. */
    getRow: (rowId: RowId) => TData | undefined;
    /** expectedId may be used to find parent/index metadata for a tree identity. */
    getRowId: (row: TData, expectedId: RowId) => RowId;
    getValue: (row: TData, columnId: ColumnId) => unknown;
    applyValues: (row: TData, values: RowDraftValues) => TData;
    /** Apply synchronously, including updating the data reader before returning. */
    accept: (rowId: RowId, row: TData) => void;
    validate?: (context: RowEditContext<TData>) => RowValidationResult | Promise<RowValidationResult>;
    save?: (context: RowEditContext<TData>) => TData | Promise<TData>;
    getVersion?: (row: TData) => unknown;
    getContextKey?: () => string;
    canEdit?: (rowId: RowId, columnId: ColumnId, row: TData) => boolean;
    classifyError?: (error: unknown) => ServerMutationFailure;
    createOperationId?: () => string;
    onListenerError?: (error: unknown) => void;
    maxDraftRows?: number;
    maxFieldsPerRow?: number;
    maxQueuedPerRow?: number;
    concurrency?: number;
    timeoutMs?: number;
}
type RowEditResult<TData> = {
    status: "success" | "stale";
    rowId: RowId;
    data: TData;
    operationId: string;
    current: boolean;
} | {
    status: "apply-error";
    rowId: RowId;
    data: TData;
    operationId: string;
    error: unknown;
} | {
    status: "unchanged";
    rowId: RowId;
} | {
    status: "validation-error";
    rowId: RowId;
    errors: RowDraftErrors;
    operationId: string;
} | {
    status: "error" | "conflict" | "cancelled";
    rowId: RowId;
    operationId: string;
    error: unknown;
};
interface RowEditingController<TData> {
    begin: (rowId: RowId) => void;
    setValue: (rowId: RowId, columnId: ColumnId, value: unknown) => boolean;
    setValues: (changes: readonly {
        rowId: RowId;
        columnId: ColumnId;
        value: unknown;
    }[]) => void;
    getState: () => RowEditingState;
    getValue: (rowId: RowId, columnId: ColumnId) => unknown;
    getCanEdit: (rowId: RowId, columnId: ColumnId) => boolean;
    project: (rowId: RowId, row: TData) => TData;
    commit: (rowId: RowId) => Promise<RowEditResult<TData>>;
    commitAll: () => Promise<RowEditResult<TData>[]>;
    retry: (rowId: RowId) => Promise<RowEditResult<TData>> | null;
    rebase: (rowId: RowId) => void;
    reconcile: () => void;
    cancel: (rowId: RowId) => void;
    cancelAll: () => void;
    undo: () => boolean;
    redo: () => boolean;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
/** Owns drafts and serialized writes; transport and authoritative data stay external. */
declare function createRowEditingController<TData>(options: RowEditingOptions<TData>): RowEditingController<TData>;

export { type RowEditResult as R, type RowDraft as a, type RowEditingState as b, type RowEditingController as c, type RowDraftErrors as d, type RowDraftStatus as e, type RowDraftValues as f, type RowEditContext as g, type RowEditingOptions as h, type RowValidationResult as i, createRowEditingController as j };
