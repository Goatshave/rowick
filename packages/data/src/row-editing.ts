import { createServerMutationCoordinator, type ColumnId, type RowId, type ServerMutationFailure, type ServerMutationResult } from "@rowick/core";
import { abortFailure, createWorkQueue, interruptible } from "./async-work";

export type RowDraftStatus = "editing" | "queued" | "validating" | "saving" | "validation-error" | "conflict" | "error";
export type RowDraftValues = Readonly<Record<ColumnId, unknown>>;
export type RowDraftErrors = Readonly<Record<ColumnId, string>>;
export interface RowDraft {
  readonly rowId: RowId;
  readonly values: RowDraftValues;
  readonly errors: RowDraftErrors;
  readonly status: RowDraftStatus;
  readonly message: string | undefined;
  readonly dirty: boolean;
  readonly pendingCount: number;
}
export interface RowEditingState {
  readonly rows: readonly RowDraft[];
  readonly dirtyRowCount: number;
  readonly pendingCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
export interface RowEditContext<TData> {
  readonly rowId: RowId;
  readonly original: TData;
  readonly candidate: TData;
  readonly values: RowDraftValues;
  readonly version: unknown;
  readonly operationId: string;
  readonly signal: AbortSignal;
}
export type RowValidationResult = { valid: true } | { valid: false; errors?: RowDraftErrors; message?: string };
export interface RowEditingOptions<TData> {
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
export type RowEditResult<TData> =
  | { status: "success" | "stale"; rowId: RowId; data: TData; operationId: string; current: boolean }
  | { status: "apply-error"; rowId: RowId; data: TData; operationId: string; error: unknown }
  | { status: "unchanged"; rowId: RowId }
  | { status: "validation-error"; rowId: RowId; errors: RowDraftErrors; operationId: string }
  | { status: "error" | "conflict" | "cancelled"; rowId: RowId; operationId: string; error: unknown };
export interface RowEditingController<TData> {
  begin: (rowId: RowId) => void;
  setValue: (rowId: RowId, columnId: ColumnId, value: unknown) => boolean;
  setValues: (changes: readonly { rowId: RowId; columnId: ColumnId; value: unknown }[]) => void;
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
interface Entry<TData> {
  base: TData; context: string; session: number; revision: number;
  fields: Map<ColumnId, { value: unknown; stamp: number }>;
  errors: Record<ColumnId, string>; status: RowDraftStatus; message: string | undefined; pending: number;
}
interface Submission<TData> { rowId: RowId; base: TData; context: string; session: number; revision: number; values: RowDraftValues; stamps: Readonly<Record<ColumnId, number>>; }
interface Acknowledgement<TData> { data: TData; previousVersion: unknown; context: string; input?: Submission<TData>; }
class InvalidRow extends Error { constructor(readonly errors: RowDraftErrors, message = "Row validation failed") { super(message); } }
class RowConflict extends Error { constructor() { super("Row or query changed; refresh and rebase the draft before saving"); } }
type DraftHistory<TData> = Array<{ rowId: RowId; base: TData; context: string; values: Array<[ColumnId, unknown]> }>;

/** Owns drafts and serialized writes; transport and authoritative data stay external. */
export function createRowEditingController<TData>(options: RowEditingOptions<TData>): RowEditingController<TData> {
  const limit = (value: number | undefined, fallback: number, maximum: number) => {
    const result = value ?? fallback;
    if (!Number.isInteger(result) || result < 1 || result > maximum) throw new TypeError("Invalid row editing limit");
    return result;
  };
  const maxRows = limit(options.maxDraftRows, 100, 10_000), maxQueued = limit(options.maxQueuedPerRow, 4, 100);
  const maxFields = limit(options.maxFieldsPerRow, 200, 10_000);
  const timeout = limit(options.timeoutMs, 30_000, 300_000), queue = createWorkQueue(limit(options.concurrency, 4, 32));
  const entries = new Map<RowId, Entry<TData>>(), listeners = new Set<() => void>();
  const running = new Map<Submission<TData>, AbortController>();
  const last = new Map<RowId, { input: Submission<TData>; promise: Promise<RowEditResult<TData>> }>();
  const applyFailures = new Map<RowId, { acknowledgement: Acknowledgement<TData>; operationId: string }>();
  const undo: DraftHistory<TData>[] = [], redo: DraftHistory<TData>[] = [];
  let disposed = false, sequence = 0, batching = false, notifying = false, notificationPending = false;
  let snapshot: RowEditingState = Object.freeze({ rows: Object.freeze([]), dirtyRowCount: 0, pendingCount: 0, canUndo: false, canRedo: false });
  const version = (row: TData) => options.getVersion ? options.getVersion(row) : row;
  const context = () => options.getContextKey?.() ?? "default";
  const active = () => { if (disposed) throw new Error("Row editing controller is disposed"); };
  const report = (error: unknown) => {
    if (options.onListenerError) { try { options.onListenerError(error); return; } catch (failure) { error = failure; } }
    queueMicrotask(() => { throw error; });
  };
  const values = (entry: Entry<TData>): RowDraftValues => Object.freeze(Object.fromEntries([...entry.fields].map(([id, field]) => [id, field.value])));
  const publish = () => {
    if (disposed || batching) return;
    const rows = [...entries].map(([rowId, entry]) => Object.freeze({ rowId, values: values(entry), errors: Object.freeze(Object.assign(Object.create(null), entry.errors)) as RowDraftErrors,
      status: entry.status, message: entry.message, dirty: entry.fields.size > 0, pendingCount: entry.pending }));
    const pendingCount = rows.reduce((total, row) => total + row.pendingCount, 0);
    snapshot = Object.freeze({ rows: Object.freeze(rows), dirtyRowCount: rows.filter((row) => row.dirty).length, pendingCount,
      canUndo: pendingCount === 0 && undo.length > 0, canRedo: pendingCount === 0 && redo.length > 0 });
    notificationPending = true;
    if (notifying) return;
    notifying = true;
    try {
      while (notificationPending && !disposed) {
        notificationPending = false;
        for (const listener of [...listeners]) if (listeners.has(listener)) { try { listener(); } catch (error) { report(error); } }
      }
    } finally { notifying = false; }
  };
  const clearHistory = () => { undo.length = 0; redo.length = 0; };
  const capture = (): DraftHistory<TData> => [...entries].map(([rowId, entry]) => ({ rowId, base: entry.base, context: entry.context,
    values: [...entry.fields].map(([id, field]) => [id, field.value]) }));
  const remember = () => { undo.push(capture()); if (undo.length > 50) undo.shift(); redo.length = 0; };
  const read = (rowId: RowId) => options.getRow(rowId);
  const matches = (input: Submission<TData>) => entries.get(input.rowId)?.session === input.session && input.context === context();
  const freshEntry = (rowId: RowId): Entry<TData> => {
    const row = read(rowId); if (row === undefined) throw new TypeError("Row must be loaded before editing");
    return { base: row, context: context(), session: ++sequence, revision: sequence, fields: new Map(), errors: {}, status: "editing", message: undefined, pending: 0 };
  };
  const changeValues = (changes: readonly { rowId: RowId; columnId: ColumnId; value: unknown }[], rejectDenied: boolean): boolean => {
    active(); const staged = new Map<RowId, Entry<TData>>();
    for (const change of changes) {
      if (typeof change.columnId !== "string" || !change.columnId.length) throw new TypeError("Column ID must be non-empty");
      const source = staged.get(change.rowId) ?? entries.get(change.rowId) ?? freshEntry(change.rowId);
      if (source.context !== context()) throw new RowConflict();
      if (options.canEdit?.(change.rowId, change.columnId, source.base) === false) {
        if (rejectDenied) throw new TypeError("Batch contains a read-only field");
        return false;
      }
      const original = options.getValue(source.base, change.columnId);
      if (Object.is(source.fields.has(change.columnId) ? source.fields.get(change.columnId)!.value : original, change.value)) continue;
      const entry = { ...source, fields: new Map(source.fields), errors: { ...source.errors }, revision: ++sequence, message: undefined };
      if (Object.is(original, change.value) && entry.pending === 0) entry.fields.delete(change.columnId);
      else entry.fields.set(change.columnId, { value: change.value, stamp: sequence });
      if (entry.fields.size > maxFields) throw new RangeError("Draft field limit reached");
      delete entry.errors[change.columnId];
      if (!entry.pending) entry.status = "editing";
      staged.set(change.rowId, entry);
    }
    if (!staged.size) return false;
    if (new Set([...entries.keys(), ...staged.keys()]).size > maxRows) throw new RangeError("Draft row limit reached");
    remember();
    for (const [id, entry] of staged) {
      if (!entries.has(id)) coordinator.reset(id, { data: entry.base, previousVersion: version(entry.base), context: entry.context });
      entries.set(id, entry);
    }
    publish(); return true;
  };
  const coordinator = createServerMutationCoordinator<RowId, Submission<TData>, Acknowledgement<TData>>({
    getKey: (input) => input.rowId,
    ...(options.createOperationId ? { createOperationId: options.createOperationId } : {}),
    onListenerError: report,
    classifyError: (error) => error instanceof InvalidRow ? "validation-error" : error instanceof RowConflict ? "conflict" : options.classifyError?.(error) ?? "error",
    mutate: async (input, mutation) => {
      const controller = new AbortController(); running.set(input, controller);
      try {
        return await queue.run(async () => {
          if (disposed || !matches(input)) throw abortFailure();
          const current = read(input.rowId);
          const previous = mutation.previousData?.context === input.context ? mutation.previousData : undefined;
          const base = previous?.data ?? input.base;
          if (current === undefined || (!Object.is(version(current), version(base)) && !Object.is(version(current), version(input.base)))) throw new RowConflict();
          const permission = () => {
            const authority = read(input.rowId);
            if (authority === undefined || (!Object.is(version(authority), version(base)) && !Object.is(version(authority), version(input.base)))) throw new RowConflict();
            return Object.fromEntries(Object.keys(input.values).filter((columnId) => options.canEdit?.(input.rowId, columnId, authority) === false)
            .map((columnId) => [columnId, "Read-only field"]));
          };
          const denied = permission();
          if (Object.keys(denied).length) throw new InvalidRow(denied);
          // A queued snapshot also contains fields from its predecessor. Preserve
          // server normalization when the user has not edited those fields again.
          const submitted = Object.freeze(Object.fromEntries(Object.entries(input.values)
            .filter(([id]) => !previous?.input || previous.input.stamps[id] !== input.stamps[id])));
          const candidate = options.applyValues(base, submitted);
          if (options.getRowId(candidate, input.rowId) !== input.rowId) throw new TypeError("Draft must preserve row identity");
          const saveContext: RowEditContext<TData> = Object.freeze({ rowId: input.rowId, original: base, candidate, values: submitted,
            version: version(base), operationId: mutation.operationId, signal: controller.signal });
          entries.get(input.rowId)!.status = "validating"; publish();
          const result = await interruptible<RowValidationResult>(() => options.validate?.(saveContext) ?? { valid: true }, controller, timeout);
          if (!result || typeof result.valid !== "boolean") throw new TypeError("Row validator must return a validation result");
          if (!result.valid) {
            const errors = result.errors ?? {};
            if (!errors || typeof errors !== "object" || Array.isArray(errors) || Object.keys(errors).length > maxFields || Object.values(errors).some((message) => typeof message !== "string")) throw new TypeError("Invalid row validation errors");
            throw new InvalidRow(Object.freeze(Object.assign(Object.create(null), errors)) as RowDraftErrors, result.message);
          }
          if (disposed || !matches(input) || controller.signal.aborted) throw abortFailure();
          const deniedAfterValidation = permission();
          if (Object.keys(deniedAfterValidation).length) throw new InvalidRow(deniedAfterValidation);
          entries.get(input.rowId)!.status = "saving"; publish();
          const data = await interruptible(() => options.save?.(saveContext) ?? candidate, controller, timeout);
          if (disposed || !matches(input) || controller.signal.aborted) throw abortFailure();
          if (options.getRowId(data, input.rowId) !== input.rowId) throw new TypeError("Save returned a different row identity");
          const ack: Acknowledgement<TData> = { data, previousVersion: version(base), context: input.context, input };
          return ack;
        }, controller.signal);
      } finally { running.delete(input); }
    },
  });
  const finish = (input: Submission<TData>, result: ServerMutationResult<Acknowledgement<TData>>): RowEditResult<TData> => {
    const entry = entries.get(input.rowId), isCurrent = !disposed && matches(input) && entry?.revision === input.revision;
    if (entry?.session === input.session) entry.pending = Math.max(0, entry.pending - 1);
    if (result.status === "success") {
      if (disposed || entry?.session !== input.session) return { status: "stale", rowId: input.rowId, data: result.data.data, operationId: result.operationId, current: false };
      const ack = result.data, current = options.getRow(input.rowId);
      const sourceMatches = current !== undefined && [version(input.base), ack.previousVersion, version(ack.data)].some((value) => Object.is(value, version(current)));
      if (disposed || input.context !== context() || !sourceMatches) {
        if (!disposed && entry) { entry.status = "conflict"; entry.message = "Saved response is stale; refresh authoritative data"; publish(); }
        return { status: "stale", rowId: input.rowId, data: ack.data, operationId: result.operationId, current: false };
      }
      try {
        if (options.getRowId(ack.data, input.rowId) !== input.rowId) throw new TypeError("Save returned a different row identity");
        options.accept(input.rowId, ack.data);
      } catch (error) {
        applyFailures.set(input.rowId, { acknowledgement: ack, operationId: result.operationId });
        if (entry) { entry.status = "error"; entry.message = "Saved data could not be applied; retry application"; }
        publish(); return { status: "apply-error", rowId: input.rowId, data: ack.data, operationId: result.operationId, error };
      }
      if (entry) {
        entry.base = ack.data; entry.errors = {}; entry.message = undefined;
        if (entry.session === input.session) for (const [id, stamp] of Object.entries(input.stamps)) {
          if (entry.fields.get(id)?.stamp === stamp) entry.fields.delete(id);
        }
        entry.status = entry.pending ? "queued" : "editing";
        if (!entry.pending && !entry.fields.size) entries.delete(input.rowId);
      }
      clearHistory(); applyFailures.delete(input.rowId);
      if (!entries.has(input.rowId)) { coordinator.reset(input.rowId); last.delete(input.rowId); }
      publish(); return { status: "success", rowId: input.rowId, data: ack.data, operationId: result.operationId, current: isCurrent };
    }
    const error = result.status === "cancelled" ? abortFailure() : result.error;
    if (!disposed && entry?.session === input.session && isCurrent) {
      entry.status = result.status === "conflict" ? "conflict" : result.status === "validation-error" ? "validation-error" : "error";
      entry.message = error instanceof Error ? error.message : "Save failed";
      entry.errors = error instanceof InvalidRow ? { ...error.errors } : {};
    }
    publish();
    if (!disposed && !entries.has(input.rowId) && coordinator.getState(input.rowId).pendingCount === 0) coordinator.reset(input.rowId);
    if (result.status === "validation-error") return { status: "validation-error", rowId: input.rowId,
      errors: error instanceof InvalidRow ? error.errors : Object.freeze({}), operationId: result.operationId };
    return { status: (error as Error)?.name === "AbortError" || result.status === "cancelled" ? "cancelled" : result.status,
      rowId: input.rowId, operationId: result.operationId, error };
  };
  const controller: RowEditingController<TData> = {
    begin: (rowId) => {
      active();
      const existing = entries.get(rowId);
      if (existing) { if (existing.context !== context()) throw new RowConflict(); return; }
      if (entries.size >= maxRows) throw new RangeError("Draft row limit reached");
      const entry = freshEntry(rowId); entries.set(rowId, entry);
      coordinator.reset(rowId, { data: entry.base, previousVersion: version(entry.base), context: entry.context }); publish();
    },
    setValue: (rowId, columnId, value) => {
      return changeValues([{ rowId, columnId, value }], false);
    },
    setValues: (changes) => {
      changeValues(changes, true);
    },
    getState: () => snapshot,
    getValue: (rowId, columnId) => {
      active(); const entry = entries.get(rowId), row = entry?.base ?? read(rowId);
      if (row === undefined) throw new TypeError("Row must be loaded before editing");
      return entry?.fields.has(columnId) ? entry.fields.get(columnId)!.value : options.getValue(row, columnId);
    },
    getCanEdit: (rowId, columnId) => {
      active(); const row = read(rowId);
      return row !== undefined && options.canEdit?.(rowId, columnId, row) !== false;
    },
    project: (rowId, row) => {
      const entry = entries.get(rowId);
      return entry?.context === context() && entry.fields.size ? options.applyValues(row, values(entry)) : row;
    },
    commit: (rowId) => {
      active(); const entry = entries.get(rowId);
      if (!entry || !entry.fields.size) return Promise.resolve({ status: "unchanged", rowId });
      if (entry.context !== context()) return Promise.reject(new RowConflict());
      const previous = last.get(rowId);
      if (entry.pending && previous?.input.revision === entry.revision && previous.input.session === entry.session) return previous.promise;
      if (entry.pending >= maxQueued) return Promise.reject(new RangeError("Queued save limit reached"));
      const input: Submission<TData> = Object.freeze({ rowId, base: entry.base, context: entry.context, session: entry.session, revision: entry.revision,
        values: values(entry), stamps: Object.freeze(Object.fromEntries([...entry.fields].map(([id, field]) => [id, field.stamp]))) });
      entry.pending += 1; entry.status = "queued";
      let task: Promise<ServerMutationResult<Acknowledgement<TData>>>;
      try { task = coordinator.run(input); }
      catch (error) { entry.pending -= 1; entry.status = "error"; publish(); return Promise.reject(error); }
      const promise = task.then((result) => finish(input, result));
      last.set(rowId, { input, promise }); publish(); return promise;
    },
    commitAll: () => { active(); return Promise.all([...entries].filter(([, entry]) => entry.fields.size).map(([id]) => controller.commit(id))); },
    retry: (rowId) => {
      active(); const entry = entries.get(rowId), previous = last.get(rowId);
      if (!entry || !previous || entry.pending) return null;
      if (entry.revision !== previous.input.revision || entry.session !== previous.input.session) throw new TypeError("Draft changed; submit a new save");
      const failedApply = applyFailures.get(rowId);
      if (failedApply) {
        entry.pending += 1;
        return Promise.resolve(finish(previous.input, { status: "success", mutationId: 0, operationId: failedApply.operationId,
          data: failedApply.acknowledgement, isCurrent: true }));
      }
      const retry = coordinator.retry(rowId); if (!retry) return null;
      entry.pending += 1; entry.status = "queued"; publish();
      const promise = retry.then((result) => finish(previous.input, result)); last.set(rowId, { input: previous.input, promise }); return promise;
    },
    rebase: (rowId) => {
      active(); const entry = entries.get(rowId); if (!entry) return;
      if (entry.pending) throw new Error("Wait for pending saves before rebasing");
      const row = read(rowId); if (row === undefined || entry.context !== context()) throw new RowConflict();
      entry.base = row; entry.revision = ++sequence; entry.errors = {}; entry.message = undefined; entry.status = "editing";
      coordinator.reset(rowId, { data: row, previousVersion: version(row), context: context() }); clearHistory(); publish();
    },
    reconcile: () => {
      active(); let changed = false;
      for (const [id, entry] of entries) {
        const row = read(id);
        if (entry.context !== context() || row === undefined || (!entry.pending && !Object.is(version(row), version(entry.base)))) {
          const message = "Row or query changed; refresh and rebase the draft before saving";
          if (entry.status !== "conflict" || entry.message !== message) { entry.status = "conflict"; entry.message = message; changed = true; }
        }
      }
      if (changed) { clearHistory(); publish(); }
    },
    cancel: (rowId) => {
      active(); entries.delete(rowId); last.delete(rowId); applyFailures.delete(rowId);
      for (const [input, abort] of running) if (input.rowId === rowId) abort.abort();
      if (coordinator.getState(rowId).pendingCount === 0) coordinator.reset(rowId);
      clearHistory(); publish();
    },
    cancelAll: () => { for (const id of [...entries.keys()]) controller.cancel(id); },
    undo: () => restore(undo, redo), redo: () => restore(redo, undo),
    subscribe: (listener) => { active(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => {
      if (disposed) return; disposed = true;
      for (const abort of running.values()) abort.abort();
      queue.dispose(); coordinator.dispose(); entries.clear(); last.clear(); applyFailures.clear(); clearHistory(); listeners.clear();
      snapshot = Object.freeze({ rows: Object.freeze([]), dirtyRowCount: 0, pendingCount: 0, canUndo: false, canRedo: false });
    },
  };
  const restore = (source: DraftHistory<TData>[], destination: DraftHistory<TData>[]) => {
    active(); if (!source.length || snapshot.pendingCount) return false;
    const target = source.at(-1)!;
    for (const saved of target) {
      const row = read(saved.rowId);
      if (saved.context !== context() || row === undefined || !Object.is(version(row), version(saved.base))) throw new RowConflict();
    }
    destination.push(capture()); source.pop();
    for (const id of entries.keys()) coordinator.reset(id);
    entries.clear(); batching = true;
    for (const saved of target) {
      controller.begin(saved.rowId); const entry = entries.get(saved.rowId)!;
      entry.fields = new Map(saved.values.map(([id, value]) => [id, { value, stamp: ++sequence }])); entry.revision = ++sequence;
    }
    batching = false; publish(); return true;
  };
  return controller;
}
