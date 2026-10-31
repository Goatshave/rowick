import { interruptible } from "./async-work";
import type { DataSelectionSnapshot, DataSourceController } from "./datasource";
export type DataActionKind = "bulk" | "export";
export interface DataActionContext { readonly signal: AbortSignal; }
export interface DataActionResult { readonly message: string; }
export interface DataSourceActionState {
  readonly status: "idle" | "pending" | "success" | "error" | "cancelled";
  readonly kind: DataActionKind | null; readonly result: DataActionResult | null; readonly error: unknown;
  readonly canRetry: boolean; readonly available: Readonly<{ bulk: boolean; export: boolean }>;
  readonly submittedSelection: Readonly<{ mode: "explicit" | "all-matching"; idCount: number; operationId: string }> | null;
}
export interface DataSourceActions {
  getState: () => DataSourceActionState;
  run: (kind: DataActionKind) => Promise<DataSourceActionState>;
  retry: () => Promise<DataSourceActionState> | null;
  cancel: () => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
/** Shares the same captured selection for bulk/export and retains IDs on retry. */
export function createDataSourceActions<TRow, TQuery>(controller: DataSourceController<TRow, TQuery>, options: {
  bulk?: (selection: DataSelectionSnapshot<TQuery>, context: DataActionContext) => Promise<DataActionResult>;
  export?: (selection: DataSelectionSnapshot<TQuery>, context: DataActionContext) => Promise<DataActionResult>;
  maxRows?: number; timeoutMs?: number; onListenerError?: (error: unknown) => void;
}): DataSourceActions {
  const timeout = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) throw new TypeError("Invalid datasource action timeout");
  const listeners = new Set<() => void>(), available = Object.freeze({ bulk: Boolean(options.bulk), export: Boolean(options.export) });
  let disposed = false, sequence = 0, abort: AbortController | undefined, pending: Promise<DataSourceActionState> | undefined;
  let last: { kind: DataActionKind; selection: DataSelectionSnapshot<TQuery> } | undefined;
  let state: DataSourceActionState = Object.freeze({ status: "idle", kind: null, result: null, error: undefined, canRetry: false, available, submittedSelection: null });
  const publish = (next: DataSourceActionState) => {
    if (disposed) return; state = Object.freeze(next);
    for (const listener of [...listeners]) if (listeners.has(listener)) { try { listener(); } catch (error) {
      if (options.onListenerError) { try { options.onListenerError(error); } catch (failure) { queueMicrotask(() => { throw failure; }); } }
      else queueMicrotask(() => { throw error; });
    } }
  };
  const execute = (input: { kind: DataActionKind; selection: DataSelectionSnapshot<TQuery> }): Promise<DataSourceActionState> => {
    if (disposed) throw new Error("Datasource actions are disposed");
    if (!controller.isSelectionCurrent(input.selection)) throw new Error("Operation belongs to a previous query");
    const handler = options[input.kind]; if (!handler) throw new TypeError("Datasource action is not configured");
    const epoch = ++sequence; abort = new AbortController(); const request = abort; last = input;
    const work = Promise.resolve().then(async () => {
      try {
        const result = await interruptible(() => handler(input.selection, { signal: request.signal }), request, timeout);
        if (!result || typeof result.message !== "string" || result.message.length > 4_000) throw new TypeError("Invalid datasource action result");
        if (!disposed && epoch === sequence) {
          if (controller.isSelectionCurrent(input.selection) && !request.signal.aborted) publish({ ...state, status: "success", result: Object.freeze({ message: result.message }), error: undefined, canRetry: false });
          else publish({ ...state, status: "cancelled", result: null, error: undefined, canRetry: false });
        }
      } catch (error) {
        if (!disposed && epoch === sequence) publish({ ...state, status: request.signal.aborted ? "cancelled" : "error", result: null, error,
          canRetry: controller.isSelectionCurrent(input.selection) });
      } finally { if (epoch === sequence) { abort = undefined; pending = undefined; } }
      return state;
    });
    const selected = input.selection.selection;
    pending = work; publish({ ...state, kind: input.kind, status: "pending", result: null, error: undefined, canRetry: false,
      submittedSelection: Object.freeze({ mode: selected.mode, idCount: selected.mode === "explicit" ? selected.ids.length : selected.excludedIds.length, operationId: input.selection.operationId }) }); return work;
  };
  const stop = controller.subscribe(() => {
    if (last && !controller.isSelectionCurrent(last.selection)) {
      sequence++; abort?.abort(); abort = undefined; pending = undefined; last = undefined;
      publish({ ...state, status: "idle", kind: null, result: null, error: undefined, canRetry: false, submittedSelection: null });
    }
  });
  const actions: DataSourceActions = {
    getState: () => state,
    run: (kind) => {
      if (disposed) throw new Error("Datasource actions are disposed");
      if (kind !== "bulk" && kind !== "export") throw new TypeError("Invalid datasource action kind");
      if (pending) return pending;
      const selected = controller.getState().selection;
      if (selected.mode === "explicit" && !selected.ids.length) throw new Error("Select rows before starting an operation");
      return execute({ kind, selection: controller.captureSelection({ ...(options.maxRows !== undefined ? { maxRows: options.maxRows } : {}) }) });
    },
    retry: () => { if (disposed) throw new Error("Datasource actions are disposed"); return pending ?? (last && state.canRetry ? execute(last) : null); },
    cancel: () => { if (disposed) return; abort?.abort(); },
    subscribe: (listener) => { if (disposed) throw new Error("Datasource actions are disposed"); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; disposed = true; sequence++; abort?.abort(); stop(); last = undefined; pending = undefined; abort = undefined; listeners.clear();
      state = Object.freeze({ status: "idle", kind: null, result: null, error: undefined, canRetry: false, available, submittedSelection: null }); },
  };
  return actions;
}
