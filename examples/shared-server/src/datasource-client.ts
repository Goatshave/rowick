import { createDataSourceActions, createDataSourceController, type DataBlockRequest, type DataLiveEvent, type DataResponse, type DataSelectionSnapshot } from "@rowick/data/server-data";
import type { PersistentDataQuery, PersistentDataRow } from "./datasource-store";
export type { PersistentDataQuery, PersistentDataRow } from "./datasource-store";
export const datasourceColumns = ["name", "value", "status", "revision"].map((accessorKey) => ({ accessorKey: accessorKey as keyof PersistentDataRow }));
export class DataHttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function jsonRequest<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  const reader = response.body?.getReader(); let bytes = 0, text = "";
  if (reader) {
    const decoder = new TextDecoder(); try { while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 1_048_576) { await reader.cancel(); throw new Error("Datasource response exceeds its byte limit"); } text += decoder.decode(item.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
  }
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const value = JSON.parse(text || "null"); if (!response.ok) throw new DataHttpError(response.status, value?.error ?? "Datasource request failed"); return value as T;
}
export function createDatasourceExample(options: { baseUrl?: string; session?: string; download?: boolean } = {}) {
  const browserSession = () => {
    const next = globalThis.crypto.randomUUID();
    if (typeof sessionStorage === "undefined") return next;
    try { const existing = sessionStorage.getItem("rowick-datasource-session"); if (existing && /^[a-zA-Z\d_-]{1,80}$/.test(existing)) return existing; sessionStorage.setItem("rowick-datasource-session", next); } catch { /* A private browser may disable storage; the tab still works. */ }
    return next;
  };
  const session = options.session ?? browserSession(), baseUrl = options.baseUrl ?? "";
  const endpoint = (route: string, extra: Record<string, string> = {}) => `${baseUrl}/__rowick/datasource/${route}?${new URLSearchParams({ session, ...extra })}`;
  let failRead = false, delayRead = false, loseBulk = false, exported: readonly PersistentDataRow[] = [], message = "Ready";
  const listeners = new Set<() => void>(), scenarioRequests = new Set<AbortController>(); let disposed = false;
  const publish = () => { if (!disposed) for (const listener of listeners) listener(); };
  const scenarioRequest = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (disposed) throw new Error("Datasource example is disposed"); const request = new AbortController(); scenarioRequests.add(request);
    try { return await work(request.signal); } finally { scenarioRequests.delete(request); }
  };
  const source = createDataSourceController<PersistentDataRow, PersistentDataQuery>({
    query: { status: "all", mode: "records" }, maxBlocks: 3, maxBlockSize: 20, maxCachedRows: 60, concurrency: 2, maxQueuedRequests: 4,
    getRowId: (row) => row.id, getRowRevision: (row) => row.revision,
    source: { getRows: async (request) => {
      const extras: Record<string, string> = { ...(failRead ? { fail: "1" } : {}), ...(delayRead ? { delay: "400" } : {}) }; failRead = false; delayRead = false;
      return jsonRequest<DataResponse<PersistentDataRow>>(endpoint("read", extras), { query: request.query, queryKey: request.queryKey, queryId: request.queryId, generation: request.generation, block: request.block }, request.signal);
    } },
  });
  const actions = createDataSourceActions(source, { maxRows: 1_000,
    bulk: async (selection, context) => {
      const lose = loseBulk; loseBulk = false;
      const result = await jsonRequest<{ matchedCount: number; affectedCount: number; deniedCount: number }>(endpoint("bulk", lose ? { lose: "1" } : {}), { selection, action: "close" }, context.signal);
      if (context.signal.aborted || !source.isSelectionCurrent(selection)) throw new DOMException("Cancelled", "AbortError");
      await source.refresh(); return { message: `${result.matchedCount} matching; ${result.affectedCount} changed; ${result.deniedCount} denied` };
    },
    export: async (selection, context) => {
      const result = await jsonRequest<{ rows: PersistentDataRow[] }>(endpoint("export"), { selection }, context.signal);
      if (context.signal.aborted || !source.isSelectionCurrent(selection)) throw new DOMException("Cancelled", "AbortError");
      exported = Object.freeze(result.rows); publish();
      if (options.download && typeof document !== "undefined") {
        const url = URL.createObjectURL(new Blob([JSON.stringify(result.rows, null, 2)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "rowick-server-selection.json"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
      return { message: `Exported ${result.rows.length} matching rows` };
    },
  });
  const run = async (action: () => unknown) => { try { await action(); message = "Ready"; } catch (error) { message = error instanceof Error ? error.message : "Action failed"; } publish(); };
  const load = (block: DataBlockRequest) => source.load(block);
  const query = (next: PersistentDataQuery, block: DataBlockRequest = { mode: "offset", offset: 0, limit: 20 }) => { source.setQuery(next); return load(block); };
  const mutate = (type: "update" | "delete" | "add") => scenarioRequest(async (signal) => {
    const queryId = source.getState().queryId;
    const row = source.getState().rows.find((row) => row.kind === "record" && !row.parentId && /^record:\d+$/.test(row.id) && Number(row.id.slice(7)) % 13 !== 0);
    if (type !== "add" && !row) throw new Error("Load an editable record first");
    const mutation = type === "add" ? { type, name: "Live added record", value: 99 } : type === "delete" ? { type, id: row!.id, expectedRevision: row!.revision } : { type, id: row!.id, expectedRevision: row!.revision, value: row!.value + 100 };
    const event = await jsonRequest<DataLiveEvent<PersistentDataRow>>(endpoint("mutate"), { queryId, mutation }, signal);
    if (signal.aborted || source.getState().queryId !== queryId) return;
    source.applyLive(event); await source.refresh();
  });
  const stopSource = source.subscribe(publish), stopActions = actions.subscribe(publish);
  return {
    source, actions, session, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getMessage: () => message, getExported: () => exported,
    start: () => run(() => load({ mode: "offset", offset: 0, limit: 20 })),
    small: () => run(() => query({ status: "all", mode: "records", limitToFirst: 40 })),
    massive: () => run(() => query({ status: "all", mode: "records" })),
    cursor: () => run(() => query({ status: "all", mode: "records", unknownTotal: true }, { mode: "cursor", cursor: null, limit: 20 })),
    filteredCursor: () => run(() => query({ status: "all", mode: "records", expression: { version: 1, root: { kind: "condition", columnId: "value", operator: "gte", value: 998 } } }, { mode: "cursor", cursor: null, limit: 20 })),
    groups: () => run(() => query({ status: "all", mode: "groups" })),
    page: () => run(() => query({ status: "all", mode: "records" }, { mode: "page", pageIndex: 0, limit: 20 })),
    offset: () => run(() => query({ status: "all", mode: "records" }, { mode: "offset", offset: 3, limit: 20 })),
    failNextRead: () => { failRead = true; return run(() => source.refresh()); },
    slowNextRead: () => { delayRead = true; return run(() => source.refresh()); },
    loseNextBulkResponse: () => { loseBulk = true; message = "The next bulk response will be lost after commit"; publish(); },
    update: () => run(() => mutate("update")), remove: () => run(() => mutate("delete")), add: () => run(() => mutate("add")),
    invalidateGap: () => run(() => scenarioRequest(async (signal) => {
      const queryId = source.getState().queryId;
      let row = source.getState().rows.find((row) => row.kind === "record" && /^record:\d+$/.test(row.id) && Number(row.id.slice(7)) % 13 !== 0);
      if (!row) throw new Error("Load an editable record first");
      let event!: DataLiveEvent<PersistentDataRow>;
      for (let index = 0; index < 3; index++) {
        if (signal.aborted || source.getState().queryId !== queryId) return;
        event = await jsonRequest<DataLiveEvent<PersistentDataRow>>(endpoint("mutate"), { queryId, mutation: { type: "update", id: row.id, expectedRevision: row.revision, value: row.value + 1 } }, signal);
        if (event.type !== "update") throw new Error("Unexpected mutation event"); row = event.row;
      }
      if (!signal.aborted && source.getState().queryId === queryId) source.applyLive(event);
    })),
    dispose: () => { if (disposed) return; disposed = true; for (const request of scenarioRequests) request.abort(); scenarioRequests.clear(); stopSource(); stopActions(); actions.dispose(); source.dispose(); listeners.clear(); },
  };
}
export type DatasourceExample = ReturnType<typeof createDatasourceExample>;
export function getDatasourceExampleActions(example: DatasourceExample) {
  return [["Massive query", example.massive], ["Small query", example.small], ["Page query", example.page], ["Offset query", example.offset], ["Cursor unknown total", example.cursor], ["Filtered cursor", example.filteredCursor],
    ["Group query", example.groups], ["Fail read once", example.failNextRead], ["Slow read", example.slowNextRead], ["Lose bulk response", example.loseNextBulkResponse],
    ["Live update", example.update], ["Live delete", example.remove], ["Live add", example.add], ["Revision gap", example.invalidateGap]] as const;
}
export function getDatasourceChildScope(row: PersistentDataRow) {
  return row.kind === "group" ? { kind: "group" as const, parentId: row.id, path: [row.status] } : !row.parentId && /^record:\d+$/.test(row.id) ? { kind: "tree" as const, parentId: row.id } : undefined;
}
export function getDatasourceEvidence(example: DatasourceExample) {
  const state = example.source.getState();
  return JSON.stringify({ session: example.session, query: state.query, revision: state.revision, cachedRows: state.cachedRowCount, blocks: state.blocks.length,
    loading: state.loadingCount, queued: state.queuedCount, selection: state.selection, exportedIds: example.getExported().map((row) => row.id) });
}
