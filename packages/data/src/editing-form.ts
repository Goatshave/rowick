import { createEditorSearchController, parseEditorValue, type EditorChoice, type EditorField, type EditorSearchController } from "./editors";
import type { RowDraft, RowEditResult, RowEditingController, RowEditingState } from "./row-editing";

export interface EditingFormField {
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
export interface EditingFormRow extends RowDraft { readonly fields: readonly EditingFormField[]; }
export interface EditingFormState extends Omit<RowEditingState, "rows"> {
  readonly rows: readonly EditingFormRow[];
  readonly invalidFieldCount: number;
  readonly message: string | undefined;
}
export type EditingFormResult<TData> = RowEditResult<TData> | { status: "invalid-input"; rowId: string };
export interface RowEditingForm<TData> {
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
interface Buffer { input: string | boolean; error: string | undefined; composing: boolean; parsed: unknown; }

/** Shared form state for all three UIs; invalid raw input never reaches row data. */
export function createRowEditingForm<TData>(editor: RowEditingController<TData>, fields: readonly EditorField[]): RowEditingForm<TData> {
  const definitions = new Map(fields.map((field) => [field.id, field]));
  if (!fields.length || fields.length > 200 || definitions.size !== fields.length || fields.some((field) => !field.id || !field.label)) throw new TypeError("Invalid editor field definitions");
  const buffers = new Map<string, Map<string, Buffer>>(), searches = new Map<string, Map<string, EditorSearchController>>();
  const listeners = new Set<() => void>(); let disposed = false, message: string | undefined;
  let snapshot: EditingFormState;
  const ensure = () => { if (disposed) throw new Error("Row editing form is disposed"); };
  const rebuild = () => {
    if (disposed) return;
    const source = editor.getState(), ids = new Set(source.rows.map((row) => row.rowId));
    for (const id of buffers.keys()) if (!ids.has(id)) buffers.delete(id);
    for (const [id, rowSearches] of searches) if (!ids.has(id)) { for (const search of rowSearches.values()) search.dispose(); searches.delete(id); }
    let invalidFieldCount = 0;
    const rows = source.rows.map((row): EditingFormRow => {
      const controls = fields.map((definition): EditingFormField => {
        const value = editor.getValue(row.rowId, definition.id), buffer = buffers.get(row.rowId)?.get(definition.id);
        let current = buffer;
        if (buffer && !buffer.error && !buffer.composing && !Object.is(buffer.parsed, value)) { buffers.get(row.rowId)!.delete(definition.id); current = undefined; }
        let initialInput: string | boolean = definition.kind === "boolean" ? value === true : value == null ? "" : String(value);
        if (!current && definition.kind !== "boolean" && definition.parse && definition.format) {
          try { initialInput = definition.format(value); if (typeof initialInput !== "string") throw new TypeError("Editor formatter must return text"); }
          catch (error) {
            current = { input: initialInput, error: error instanceof Error ? error.message : "Editor formatting failed", composing: false, parsed: undefined };
            const rowBuffers = buffers.get(row.rowId) ?? new Map<string, Buffer>(); buffers.set(row.rowId, rowBuffers); rowBuffers.set(definition.id, current);
          }
        }
        const search = searches.get(row.rowId)?.get(definition.id)?.getState();
        if (current?.error || current?.composing) invalidFieldCount++;
        return Object.freeze({ definition, input: current?.input ?? initialInput,
          disabled: definition.readOnly === true || !editor.getCanEdit(row.rowId, definition.id), error: current?.error ?? row.errors[definition.id],
          composing: current?.composing ?? false, choices: definition.kind === "select" ? definition.choices : search?.choices ?? [],
          searchQuery: search?.query ?? "", searchLoading: search?.loading ?? false, searchError: search?.error });
      });
      return Object.freeze({ ...row, fields: Object.freeze(controls) });
    });
    snapshot = Object.freeze({ ...source, rows: Object.freeze(rows), invalidFieldCount, message });
    for (const listener of [...listeners]) if (listeners.has(listener)) { try { listener(); } catch (error) { queueMicrotask(() => { throw error; }); } }
  };
  const unsubscribe = editor.subscribe(rebuild);
  const hasInvalid = (rowId: string) => [...(buffers.get(rowId)?.values() ?? [])].some((buffer) => buffer.error || buffer.composing);
  const validateBuffered = (rowId: string) => {
    const row = snapshot.rows.find((row) => row.rowId === rowId);
    for (const field of row?.fields ?? []) {
      if (field.disabled || field.composing || buffers.get(rowId)?.has(field.definition.id)) continue;
      // Existing remote choice IDs need not be in the current search result.
      if (field.definition.kind === "async-select" && field.input !== "") continue;
      const parsed = parseEditorValue(field.definition, field.input, field.choices);
      if (!parsed.valid) {
        const rowBuffers = buffers.get(rowId) ?? new Map<string, Buffer>(); buffers.set(rowId, rowBuffers);
        rowBuffers.set(field.definition.id, { input: field.input, error: parsed.message, composing: false, parsed: undefined });
      }
    }
    if (hasInvalid(rowId)) { message = "Review invalid fields before saving"; rebuild(); return false; }
    return true;
  };
  const requireField = (rowId: string, fieldId: string) => {
    ensure(); const field = definitions.get(fieldId);
    if (!field || !editor.getState().rows.some((row) => row.rowId === rowId)) throw new TypeError("Begin editing a loaded row first");
    return field;
  };
  const form: RowEditingForm<TData> = {
    getState: () => snapshot,
    setInput: (rowId, fieldId, input, composing = false) => {
      const field = requireField(rowId, fieldId);
      if (field.readOnly || !editor.getCanEdit(rowId, fieldId)) return;
      const result = composing ? undefined : parseEditorValue(field, input, searches.get(rowId)?.get(fieldId)?.getState().choices);
      const rowBuffers = buffers.get(rowId) ?? new Map<string, Buffer>(); buffers.set(rowId, rowBuffers);
      rowBuffers.set(fieldId, { input, error: result?.valid === false ? result.message : undefined, composing, parsed: result?.valid ? result.value : undefined });
      message = undefined;
      if (result?.valid) editor.setValue(rowId, fieldId, result.value);
      rebuild();
    },
    search: async (rowId, fieldId, query) => {
      const field = requireField(rowId, fieldId);
      if (field.kind !== "async-select") throw new TypeError("Field does not have an asynchronous search");
      const rowSearches = searches.get(rowId) ?? new Map<string, EditorSearchController>(); searches.set(rowId, rowSearches);
      let search = rowSearches.get(fieldId);
      if (!search) { search = createEditorSearchController(field.search); rowSearches.set(fieldId, search); search.subscribe(rebuild); }
      await search.search(query);
    },
    save: async (rowId) => {
      ensure(); if (!validateBuffered(rowId)) return { status: "invalid-input", rowId };
      message = undefined;
      try { return await editor.commit(rowId); } catch (error) { message = error instanceof Error ? error.message : "Save failed"; rebuild(); throw error; }
    },
    saveAll: () => { ensure(); return Promise.all(snapshot.rows.map((row) => form.save(row.rowId))); },
    retry: async (rowId) => { ensure(); if (!validateBuffered(rowId)) return { status: "invalid-input", rowId }; return await editor.retry(rowId); },
    cancel: (rowId) => { ensure(); if (rowId === undefined) { buffers.clear(); editor.cancelAll(); } else { buffers.delete(rowId); editor.cancel(rowId); } message = undefined; rebuild(); },
    rebase: (rowId) => { ensure(); editor.rebase(rowId); rebuild(); },
    undo: () => { ensure(); const changed = editor.undo(); if (changed) { buffers.clear(); rebuild(); } return changed; },
    redo: () => { ensure(); const changed = editor.redo(); if (changed) { buffers.clear(); rebuild(); } return changed; },
    subscribe: (listener) => { ensure(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; disposed = true; unsubscribe(); for (const row of searches.values()) for (const search of row.values()) search.dispose();
      searches.clear(); buffers.clear(); listeners.clear(); },
  };
  rebuild(); return form;
}
