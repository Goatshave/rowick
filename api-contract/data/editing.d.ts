import { R as RowEditResult, a as RowDraft, b as RowEditingState, c as RowEditingController } from './row-editing-Br6I_8ib.js';
export { d as RowDraftErrors, e as RowDraftStatus, f as RowDraftValues, g as RowEditContext, h as RowEditingOptions, i as RowValidationResult, j as createRowEditingController } from './row-editing-Br6I_8ib.js';
import '@rowick/core';

interface EditorChoice {
    readonly value: string;
    readonly label: string;
    readonly disabled?: boolean;
}
interface EditorFieldBase {
    readonly id: string;
    readonly label: string;
    readonly readOnly?: boolean;
    readonly required?: boolean;
    readonly format?: (value: unknown) => string;
    /** Explicit opt-in parser. Successful results still satisfy the field schema. */
    readonly parse?: (input: string | boolean) => EditorParseResult;
}
/** Decimal/currency and calendar dates remain strings. Number is explicitly binary64. */
type EditorField = EditorFieldBase & ({
    readonly kind: "text" | "long-text";
    readonly maxLength?: number;
} | {
    readonly kind: "number";
    readonly integer?: boolean;
    readonly min?: number;
    readonly max?: number;
} | {
    readonly kind: "decimal" | "currency";
    readonly scale?: number;
} | {
    readonly kind: "date";
} | {
    readonly kind: "boolean";
} | {
    readonly kind: "select";
    readonly choices: readonly EditorChoice[];
} | {
    readonly kind: "async-select";
    readonly search: (query: string, signal: AbortSignal) => Promise<readonly EditorChoice[]>;
});
type EditorParseResult = {
    readonly valid: true;
    readonly value: unknown;
} | {
    readonly valid: false;
    readonly message: string;
};
declare function formatEditorValue(field: EditorField, value: unknown): string;
declare function parseEditorValue(field: EditorField, input: string | boolean, choices?: readonly EditorChoice[]): EditorParseResult;
interface EditorSearchState {
    readonly query: string;
    readonly loading: boolean;
    readonly choices: readonly EditorChoice[];
    readonly error: string | undefined;
}
interface EditorSearchController {
    getState: () => EditorSearchState;
    search: (query: string) => Promise<void>;
    retry: () => Promise<void>;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
/** Keeps at most one result set. Obsolete, timed-out and disposed responses cannot publish. */
declare function createEditorSearchController(search: (query: string, signal: AbortSignal) => Promise<readonly EditorChoice[]>, options?: {
    maxChoices?: number;
    timeoutMs?: number;
}): EditorSearchController;

interface EditingFormField {
    readonly definition: EditorField;
    readonly input: string | boolean;
    readonly disabled: boolean;
    readonly error: string | undefined;
    readonly composing: boolean;
    readonly choices: readonly EditorChoice[];
    readonly searchQuery: string;
    readonly searchLoading: boolean;
    readonly searchError: string | undefined;
}
interface EditingFormRow extends RowDraft {
    readonly fields: readonly EditingFormField[];
}
interface EditingFormState extends Omit<RowEditingState, "rows"> {
    readonly rows: readonly EditingFormRow[];
    readonly invalidFieldCount: number;
    readonly message: string | undefined;
}
type EditingFormResult<TData> = RowEditResult<TData> | {
    status: "invalid-input";
    rowId: string;
};
interface RowEditingForm<TData> {
    getState: () => EditingFormState;
    setInput: (rowId: string, fieldId: string, input: string | boolean, composing?: boolean) => void;
    search: (rowId: string, fieldId: string, query: string) => Promise<void>;
    save: (rowId: string) => Promise<EditingFormResult<TData>>;
    saveAll: () => Promise<EditingFormResult<TData>[]>;
    retry: (rowId: string) => Promise<EditingFormResult<TData> | null>;
    cancel: (rowId?: string) => void;
    rebase: (rowId: string) => void;
    undo: () => boolean;
    redo: () => boolean;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
/** Shared form state for all three UIs; invalid raw input never reaches row data. */
declare function createRowEditingForm<TData>(editor: RowEditingController<TData>, fields: readonly EditorField[]): RowEditingForm<TData>;

interface EditingLabels {
    panel: string;
    saveAll: string;
    cancelAll: string;
    undo: string;
    redo: string;
    save: string;
    cancel: string;
    retry: string;
    rebase: string;
    search: string;
    loading: string;
    choose: string;
    empty: string;
    summary: (dirty: number, pending: number, invalid: number) => string;
    row: (id: string) => string;
    status: (status: string) => string;
}
declare const defaultEditingLabels: EditingLabels;

export { type EditingFormField, type EditingFormResult, type EditingFormRow, type EditingFormState, type EditingLabels, type EditorChoice, type EditorField, type EditorParseResult, type EditorSearchController, type EditorSearchState, RowDraft, RowEditResult, RowEditingController, type RowEditingForm, RowEditingState, createEditorSearchController, createRowEditingForm, defaultEditingLabels, formatEditorValue, parseEditorValue };
