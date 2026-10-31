import { createServerSelection, type GridState, type ServerSelection } from "@rowick/core";
import { abortFailure, interruptible } from "./async-work";

export type DataTotal = { readonly kind: "exact"; readonly count: number } | { readonly kind: "unknown" };
export type DataScalar = string | number | boolean | null;
export type DataPosition = { readonly mode: "page"; readonly pageIndex: number } |
  { readonly mode: "offset"; readonly offset: number } | { readonly mode: "cursor"; readonly cursor: string | null };
export interface DataChildScope { readonly kind: "group" | "tree"; readonly parentId: string; readonly path?: readonly DataScalar[]; }
export type DataBlockRequest = DataPosition & { readonly limit: number; readonly scope?: DataChildScope };
export interface DataRequest<TQuery> {
  readonly query: Readonly<TQuery>; readonly queryKey: string; readonly queryId: string; readonly generation: number;
  readonly block: DataBlockRequest; readonly signal: AbortSignal;
}
export interface DataResponse<TRow> {
  /** Echo the request's identity; never reuse a result across query universes. */
  readonly queryId: string; readonly rows: readonly TRow[]; readonly total: DataTotal; readonly revision: number;
  readonly hasNext: boolean; readonly nextCursor?: string | null; readonly previousCursor?: string | null;
  /** Absolute zero-based row rank; omission is unknown for a cursor window. */
  readonly rowOffset?: number;
  readonly aggregates?: Readonly<Record<string, DataScalar>>;
}
export interface DataSource<TRow, TQuery> { getRows: (request: DataRequest<TQuery>) => Promise<DataResponse<TRow>>; }
export interface CachedDataBlock<TRow> extends DataResponse<TRow> { readonly key: string; readonly request: DataBlockRequest; readonly stale: boolean; }
export type DataLoadResult<TRow> = { readonly status: "loaded" | "cached"; readonly block: CachedDataBlock<TRow> } |
  { readonly status: "cancelled" | "stale" } | { readonly status: "error"; readonly error: unknown };
export interface DataSelectionSnapshot<TQuery> {
  readonly version: 1; readonly queryId: string; readonly selection: ServerSelection<TQuery>;
  readonly observedRevision: number | null; readonly evaluation: "live-query"; readonly operationId: string; readonly maxRows: number;
}
export type DataLiveEvent<TRow> = {
  readonly queryId: string; readonly revision: number; readonly total?: DataTotal; readonly aggregates?: Readonly<Record<string, DataScalar>>;
} & ({ readonly type: "update"; readonly row: TRow; readonly impact: "patch" | "query" } |
  { readonly type: "add"; readonly row: TRow } | { readonly type: "delete"; readonly id: string });
export interface DataSourceState<TRow, TQuery> {
  readonly query: Readonly<TQuery>; readonly queryKey: string; readonly queryId: string; readonly generation: number;
  readonly status: "idle" | "loading" | "ready" | "error" | "stale";
  readonly activeBlock: DataBlockRequest | null; readonly blocks: readonly CachedDataBlock<TRow>[];
  readonly rows: readonly TRow[]; readonly total: DataTotal; readonly revision: number | null;
  readonly aggregates: Readonly<Record<string, DataScalar>>; readonly needsRefresh: boolean;
  readonly loadingCount: number; readonly queuedCount: number; readonly cachedRowCount: number;
  readonly error: unknown; readonly selection: ServerSelection<TQuery>;
}
/** Transport-neutral cache data. Products own row serialization and revival. */
export interface DataSourceHydration<TRow> {
  readonly version: 1; readonly queryKey: string; readonly revision: number | null;
  readonly total: DataTotal; readonly aggregates: Readonly<Record<string, DataScalar>>;
  readonly activeBlock: DataBlockRequest | null;
  readonly blocks: readonly { readonly request: DataBlockRequest; readonly response: Omit<DataResponse<TRow>, "queryId"> }[];
}
export interface DataSourceControllerOptions<TRow, TQuery> {
  source: DataSource<TRow, TQuery>; query: TQuery; getRowId: (row: TRow) => string;
  getRowRevision?: (row: TRow) => number;
  maxBlocks?: number; maxCachedRows?: number; maxBlockSize?: number; concurrency?: number; maxQueuedRequests?: number;
  maxSignalWaiters?: number; maxSelectionIds?: number; timeoutMs?: number;
  createQueryId?: () => string; createOperationId?: () => string; onListenerError?: (error: unknown) => void;
  initialData?: DataSourceHydration<TRow>;
}
export interface DataSourceController<TRow, TQuery> {
  getState: () => DataSourceState<TRow, TQuery>;
  getRowId: (row: TRow) => string;
  setQuery: (query: TQuery) => boolean;
  load: (block: DataBlockRequest, options?: { force?: boolean; activate?: boolean; signal?: AbortSignal }) => Promise<DataLoadResult<TRow>>;
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
  captureSelection: (options?: { operationId?: string; maxRows?: number }) => DataSelectionSnapshot<TQuery>;
  isSelectionCurrent: (snapshot: DataSelectionSnapshot<TQuery>) => boolean;
  dehydrate: () => DataSourceHydration<TRow>;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
interface Job<TRow> {
  key: string; block: DataBlockRequest; generation: number; abort: AbortController; started: boolean; uncancellable: boolean;
  waiters: Set<() => void>; promise: Promise<DataLoadResult<TRow>>; resolve: (result: DataLoadResult<TRow>) => void;
}
const unknownTotal: DataTotal = Object.freeze({ kind: "unknown" });
const emptyAggregates: Readonly<Record<string, DataScalar>> = Object.freeze(Object.create(null)) as Readonly<Record<string, DataScalar>>;
const scalar = (value: unknown): value is DataScalar => value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function id(value: unknown): asserts value is string { if (typeof value !== "string" || !value.length || value.length > 1_000) throw new TypeError("Invalid datasource identity"); }
function rowIdentity(value: unknown): asserts value is string { id(value); if (value.startsWith("__group__")) throw new TypeError("Reserved datasource row identity"); }
function ownRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) => !Object.hasOwn(descriptor, "value") || !descriptor.enumerable)) throw new TypeError("Datasource values must be plain data");
}
function dataArray(value: unknown, maximum: number): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum ||
    Reflect.ownKeys(value).some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) throw new TypeError("Invalid datasource array");
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw new TypeError("Invalid datasource array");
  }
}
function total(value: DataTotal): DataTotal {
  ownRecord(value);
  if (value.kind === "unknown" && Object.keys(value).length === 1) return unknownTotal;
  if (value.kind !== "exact" || !nonNegative(value.count) || Object.keys(value).length !== 2) throw new TypeError("Invalid datasource total");
  return Object.freeze({ kind: "exact", count: value.count });
}
function aggregates(value: Readonly<Record<string, DataScalar>> | undefined) {
  if (value === undefined) return emptyAggregates;
  ownRecord(value); const entries = Object.entries(value);
  if (entries.length > 100 || entries.some(([key, value]) => key.length > 1_000 || !scalar(value) || typeof value === "string" && value.length > 1_000)) throw new TypeError("Invalid datasource aggregates");
  return Object.freeze(Object.assign(Object.create(null), Object.fromEntries(entries))) as Readonly<Record<string, DataScalar>>;
}
/** Captures finite JSON, sorts keys, rejects getters/cycles and bounds query work. */
export function captureDataQuery<TQuery>(query: TQuery): { query: Readonly<TQuery>; key: string } {
  let nodes = 0, characters = 0; const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 2_000 || depth > 16) throw new RangeError("Datasource query is too large");
    if (scalar(value)) {
      if (typeof value === "string" && (characters += value.length) > 16_000) throw new RangeError("Datasource query is too large");
      return value;
    }
    if (!value || typeof value !== "object" || ancestors.has(value)) throw new TypeError("Datasource query must contain finite JSON values");
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 1_000 || Reflect.ownKeys(value).some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)))) throw new TypeError("Invalid datasource query array");
        for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, index)!, "value")) throw new TypeError("Invalid datasource query array");
        return Object.freeze(value.map((item) => visit(item, depth + 1)));
      }
      ownRecord(value);
      return Object.freeze(Object.fromEntries(Object.keys(value).sort().map((key) => {
        if ((characters += key.length) > 16_000) throw new RangeError("Datasource query is too large");
        return [key, visit(value[key], depth + 1)];
      })));
    } finally { ancestors.delete(value); }
  };
  const captured = visit(query, 0) as Readonly<TQuery>, key = JSON.stringify(captured);
  if (key.length > 131_072) throw new RangeError("Datasource query is too large");
  return { query: captured, key };
}
function blockRequest(input: DataBlockRequest, maximum: number): DataBlockRequest {
  ownRecord(input);
  const allowed = ["mode", "pageIndex", "offset", "cursor", "limit", "scope"];
  if (Object.keys(input).some((key) => !allowed.includes(key)) || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > maximum) throw new TypeError("Invalid datasource block size");
  let position: DataPosition;
  if (input.mode === "page" && nonNegative(input.pageIndex) && Number.isSafeInteger((input.pageIndex + 1) * input.limit)) position = { mode: "page", pageIndex: input.pageIndex };
  else if (input.mode === "offset" && nonNegative(input.offset) && Number.isSafeInteger(input.offset + input.limit)) position = { mode: "offset", offset: input.offset };
  else if (input.mode === "cursor" && (input.cursor === null || typeof input.cursor === "string" && input.cursor.length > 0 && input.cursor.length <= 4_000)) position = { mode: "cursor", cursor: input.cursor };
  else throw new TypeError("Invalid datasource block position");
  const positionKeys = input.mode === "page" ? ["pageIndex"] : input.mode === "offset" ? ["offset"] : ["cursor"];
  if (["pageIndex", "offset", "cursor"].some((key) => Object.hasOwn(input, key) && !positionKeys.includes(key))) throw new TypeError("Conflicting datasource positions");
  let scope: DataChildScope | undefined;
  if (input.scope !== undefined) {
    ownRecord(input.scope); id(input.scope.parentId);
    if (!["group", "tree"].includes(input.scope.kind) || Object.keys(input.scope).some((key) => !["kind", "parentId", "path"].includes(key))) throw new TypeError("Invalid datasource child scope");
    const path = input.scope.path;
    if (path !== undefined && (!Array.isArray(path) || path.length > 16 || !path.every(scalar) || path.some((part) => typeof part === "string" && part.length > 1_000))) throw new TypeError("Invalid datasource child path");
    if (path) captureDataQuery(path);
    scope = Object.freeze({ kind: input.scope.kind, parentId: input.scope.parentId, ...(path ? { path: Object.freeze([...path]) } : {}) });
  }
  return Object.freeze({ ...position, limit: input.limit, ...(scope ? { scope } : {}) });
}
export function validateDataBlockRequest(input: unknown, maximum = 5_000): DataBlockRequest {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 5_000) throw new TypeError("Invalid datasource maximum block size");
  return blockRequest(input as DataBlockRequest, maximum);
}

/** Bounded optional remote row model. Source transport and server authority remain external. */
export function createDataSourceController<TRow, TQuery>(options: DataSourceControllerOptions<TRow, TQuery>): DataSourceController<TRow, TQuery> {
  if (typeof options.source?.getRows !== "function" || typeof options.getRowId !== "function") throw new TypeError("Datasource requires getRows and getRowId");
  const limit = (value: number | undefined, fallback: number, maximum: number) => {
    const actual = value ?? fallback; if (!Number.isSafeInteger(actual) || actual < 1 || actual > maximum) throw new TypeError("Invalid datasource limit"); return actual;
  };
  const maxBlocks = limit(options.maxBlocks, 20, 1_000), maxBlock = limit(options.maxBlockSize, 100, 5_000);
  const maxRows = limit(options.maxCachedRows, maxBlocks * maxBlock, 1_000_000), concurrency = limit(options.concurrency, 4, 32);
  const maxQueued = limit(options.maxQueuedRequests, 32, 1_000), maxWaiters = limit(options.maxSignalWaiters, 64, 1_000);
  const maxSelected = limit(options.maxSelectionIds, 5_000, 100_000), timeout = limit(options.timeoutMs, 30_000, 300_000);
  if (maxRows < maxBlock) throw new TypeError("Datasource row cache must fit one maximum-sized block");
  const cache = new Map<string, CachedDataBlock<TRow>>(), jobs = new Map<string, Job<TRow>>(), queue: Job<TRow>[] = [];
  const failures = new Map<string, { request: DataBlockRequest; error: unknown }>(), listeners = new Set<() => void>();
  let captured = captureDataQuery(options.query), generation = 0, queryId = nextIdentity(options.createQueryId), revision: number | null = null;
  let activeKey: string | null = null, activeRequest: DataBlockRequest | null = null, activeCount = 0, disposed = false, needsRefresh = false;
  let remoteTotal = unknownTotal, remoteAggregates = emptyAggregates, snapshot: DataSourceState<TRow, TQuery>;
  let notifying = false, notificationPending = false;
  const selection = createServerSelection({ query: captured.query as TQuery, getQueryKey: (query) => captureDataQuery(query).key });
  const assertActive = () => { if (disposed) throw new Error("Datasource is disposed"); };
  const keyOf = (request: DataBlockRequest) => JSON.stringify(request);
  const rowCount = () => [...cache.values()].reduce((count, block) => count + block.rows.length, 0);
  const report = (error: unknown) => {
    if (options.onListenerError) { try { options.onListenerError(error); return; } catch (failure) { error = failure; } }
    queueMicrotask(() => { throw error; });
  };
  const publish = () => {
    if (disposed) return;
    const failed = activeKey !== null && failures.has(activeKey), error = activeKey ? failures.get(activeKey)?.error : undefined, current = activeKey ? cache.get(activeKey) : undefined;
    snapshot = Object.freeze({ query: captured.query, queryKey: captured.key, queryId, generation,
      status: failed ? "error" : jobs.size ? "loading" : needsRefresh || current?.stale ? "stale" : current ? "ready" : "idle",
      activeBlock: activeRequest, blocks: Object.freeze([...cache.values()]), rows: current?.rows ?? Object.freeze([]),
      total: remoteTotal, revision, aggregates: remoteAggregates, needsRefresh, loadingCount: activeCount,
      queuedCount: queue.length, cachedRowCount: rowCount(), error, selection: selection.getState() });
    notificationPending = true; if (notifying) return; notifying = true;
    try {
      while (notificationPending && !disposed) {
        notificationPending = false;
        for (const listener of [...listeners]) if (listeners.has(listener)) { try { listener(); } catch (error) { report(error); } }
      }
    } finally { notifying = false; }
  };
  const trimCache = () => {
    while (cache.size > maxBlocks || rowCount() > maxRows) {
      const victim = [...cache.keys()].find((key) => key !== activeKey) ?? cache.keys().next().value;
      if (victim === undefined) break; cache.delete(victim);
    }
  };
  const touch = (key: string) => { const block = cache.get(key); if (block) { cache.delete(key); cache.set(key, block); } return block; };
  const validateResponse = (response: DataResponse<TRow>, job: Pick<Job<TRow>, "key" | "block">): CachedDataBlock<TRow> => {
    ownRecord(response);
    if (response.queryId !== queryId || typeof response.hasNext !== "boolean" || !nonNegative(response.revision)) throw new TypeError("Invalid datasource response");
    dataArray(response.rows, job.block.limit);
    for (const cursor of [response.nextCursor, response.previousCursor]) if (cursor !== undefined && cursor !== null && (typeof cursor !== "string" || !cursor.length || cursor.length > 4_000)) throw new TypeError("Invalid datasource cursor");
    if (response.rowOffset !== undefined && !nonNegative(response.rowOffset)) throw new TypeError("Invalid datasource absolute row offset");
    if (job.block.mode === "cursor" && response.hasNext && (typeof response.nextCursor !== "string" || response.nextCursor === job.block.cursor)) throw new TypeError("Datasource cursor did not advance");
    const seen = new Set<string>();
    for (const row of response.rows) {
      const rowId = options.getRowId(row); rowIdentity(rowId);
      if (seen.has(rowId)) throw new TypeError("Duplicate datasource row identity"); seen.add(rowId);
      if (options.getRowRevision && !nonNegative(options.getRowRevision(row))) throw new TypeError("Invalid datasource row revision");
    }
    const declaredTotal = total(response.total);
    if (declaredTotal.kind === "exact" && response.rows.length > declaredTotal.count) throw new TypeError("Datasource rows exceed the declared total");
    const declaredOffset = response.rowOffset ?? (job.block.mode === "offset" ? job.block.offset : job.block.mode === "page" ? job.block.pageIndex * job.block.limit : undefined);
    if (declaredTotal.kind === "exact" && response.rows.length && declaredOffset !== undefined && declaredOffset + response.rows.length > declaredTotal.count) throw new TypeError("Datasource block exceeds the declared total");
    return Object.freeze({ queryId, rows: Object.freeze([...response.rows]), total: declaredTotal, revision: response.revision,
      hasNext: response.hasNext, ...(response.nextCursor !== undefined ? { nextCursor: response.nextCursor } : {}),
      ...(response.previousCursor !== undefined ? { previousCursor: response.previousCursor } : {}),
      ...(response.rowOffset !== undefined ? { rowOffset: response.rowOffset } : {}),
      ...(response.aggregates !== undefined ? { aggregates: aggregates(response.aggregates) } : {}), key: job.key, request: job.block, stale: false });
  };
  const finish = (job: Job<TRow>, result: DataLoadResult<TRow>) => {
    if (jobs.get(job.key) === job) jobs.delete(job.key);
    for (const clean of [...job.waiters]) clean(); job.waiters.clear();
    job.resolve(result);
  };
  const drain = () => {
    while (!disposed && activeCount < concurrency && queue.length) {
      const job = queue.shift()!;
      if (job.abort.signal.aborted) { finish(job, { status: "cancelled" }); continue; }
      job.started = true; activeCount++;
      const request: DataRequest<TQuery> = Object.freeze({ query: captured.query, queryKey: captured.key, queryId, generation: job.generation, block: job.block, signal: job.abort.signal });
      void (async () => {
        let result: DataLoadResult<TRow>;
        try {
          const response = await interruptible(() => options.source.getRows(request), job.abort, timeout);
          if (disposed || job.abort.signal.aborted) result = { status: "cancelled" };
          else if (job.generation !== generation || jobs.get(job.key) !== job || request.queryId !== queryId) result = { status: "stale" };
          else {
            const block = validateResponse(response, job);
            if (revision !== null && block.revision < revision) { if (activeKey === job.key) needsRefresh = true; result = { status: "stale" }; }
            else {
              if (revision !== null && block.revision !== revision) cache.clear();
              revision = block.revision; cache.delete(job.key); cache.set(job.key, block); trimCache(); failures.delete(job.key);
              if (!block.request.scope) { remoteTotal = block.total; remoteAggregates = block.aggregates ?? emptyAggregates; }
              needsRefresh = false; result = { status: "loaded", block };
            }
          }
        } catch (error) {
          if (disposed || job.abort.signal.aborted) result = { status: "cancelled" };
          else if (job.generation !== generation || jobs.get(job.key) !== job) result = { status: "stale" };
          else { failures.delete(job.key); failures.set(job.key, { request: job.block, error }); while (failures.size > maxBlocks) failures.delete(failures.keys().next().value!); result = { status: "error", error }; }
        } finally { activeCount--; }
        finish(job, result!); publish(); drain();
      })();
    }
    publish();
  };
  const attach = (job: Job<TRow>, signal: AbortSignal | undefined): Promise<DataLoadResult<TRow>> => {
    if (!signal) { job.uncancellable = true; return job.promise; }
    if (signal.aborted) return Promise.resolve({ status: "cancelled" });
    if (job.waiters.size >= maxWaiters) throw new RangeError("Datasource signal waiter limit reached");
    return new Promise((resolve) => {
      let settled = false;
      const clean = () => { signal.removeEventListener("abort", cancel); job.waiters.delete(clean); };
      const cancel = () => {
        if (settled) return; settled = true; clean(); resolve({ status: "cancelled" });
        if (!job.uncancellable && !job.waiters.size) abortJob(job);
      };
      job.waiters.add(clean); signal.addEventListener("abort", cancel, { once: true });
      void job.promise.then((result) => { if (!settled) { settled = true; clean(); resolve(result); } });
    });
  };
  const abortJob = (job: Job<TRow>) => {
    job.abort.abort();
    if (!job.started) { const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1); finish(job, { status: "cancelled" }); }
  };
  const invalidateAll = () => {
    generation++; for (const job of [...jobs.values()]) abortJob(job);
    for (const [key, block] of cache) cache.set(key, Object.freeze({ ...block, stale: true }));
    failures.clear(); needsRefresh = true;
  };
  const controller: DataSourceController<TRow, TQuery> = {
    getState: () => snapshot,
    getRowId: (row) => { assertActive(); const value = options.getRowId(row); rowIdentity(value); return value; },
    setQuery: (query) => {
      assertActive(); const next = captureDataQuery(query); if (next.key === captured.key) return false;
      const nextId = nextIdentity(options.createQueryId); invalidateAll(); captured = next; queryId = nextId;
      cache.clear(); failures.clear(); activeKey = null; activeRequest = null; revision = null; remoteTotal = unknownTotal; remoteAggregates = emptyAggregates; needsRefresh = false;
      selection.setQuery(next.query as TQuery); publish(); return true;
    },
    load: (input, settings = {}) => {
      assertActive(); const request = blockRequest(input, maxBlock), key = keyOf(request);
      if (settings.signal?.aborted) return Promise.resolve({ status: "cancelled" });
      const existing = jobs.get(key);
      if (existing && existing.generation === generation && !existing.abort.signal.aborted) {
        const promise = attach(existing, settings.signal); if (settings.activate !== false) { activeKey = key; activeRequest = request; publish(); } return promise;
      }
      const cached = touch(key);
      if (!settings.force && cached && !cached.stale) {
        if (settings.activate !== false) { activeKey = key; activeRequest = request; publish(); } return Promise.resolve({ status: "cached", block: cached });
      }
      if (activeCount >= concurrency && queue.length >= maxQueued) return Promise.reject(new RangeError("Datasource request queue limit reached"));
      let resolve!: (result: DataLoadResult<TRow>) => void;
      const promise = new Promise<DataLoadResult<TRow>>((done) => { resolve = done; });
      const job: Job<TRow> = { key, block: request, generation, abort: new AbortController(), started: false, uncancellable: false, waiters: new Set(), promise, resolve };
      const attached = attach(job, settings.signal);
      jobs.set(key, job); queue.push(job); failures.delete(key);
      if (settings.activate !== false) { activeKey = key; activeRequest = request; }
      drain(); return attached;
    },
    getBlock: (input) => { assertActive(); return touch(keyOf(blockRequest(input, maxBlock))); },
    getLoadedRows: () => { assertActive(); const rows = new Map<string, TRow>(); for (const block of cache.values()) for (const row of block.rows) rows.set(options.getRowId(row), row); return Object.freeze([...rows.values()]); },
    retry: (input) => { assertActive(); const request = input ? blockRequest(input, maxBlock) : activeRequest; return request && failures.has(keyOf(request)) ? controller.load(request, { force: true }) : null; },
    refresh: () => { assertActive(); invalidateAll(); publish(); return activeRequest ? controller.load(activeRequest, { force: true }) : null; },
    invalidate: (input) => {
      assertActive(); if (!input) invalidateAll();
      else { const key = keyOf(blockRequest(input, maxBlock)), job = jobs.get(key); if (job) abortJob(job); const block = cache.get(key); if (block) cache.set(key, Object.freeze({ ...block, stale: true })); failures.delete(key); needsRefresh = true; }
      publish();
    },
    cancel: (input) => { assertActive(); if (input) { const job = jobs.get(keyOf(blockRequest(input, maxBlock))); if (job) abortJob(job); } else for (const job of [...jobs.values()]) abortJob(job); publish(); },
    applyLive: (event) => {
      assertActive(); if (event.queryId !== queryId) return "ignored";
      if (!["add", "update", "delete"].includes(event.type) || event.type === "update" && !["patch", "query"].includes(event.impact)) throw new TypeError("Invalid datasource live event");
      if (!nonNegative(event.revision)) throw new TypeError("Invalid datasource live revision");
      if (revision !== null && event.revision <= revision) return "ignored";
      const nextTotal = event.total ? total(event.total) : remoteTotal, nextAggregates = event.aggregates ? aggregates(event.aggregates) : remoteAggregates;
      const contiguous = revision !== null && event.revision === revision + 1;
      if (event.type === "delete") rowIdentity(event.id); else rowIdentity(options.getRowId(event.row));
      if (!contiguous || event.type !== "update" || event.impact !== "patch") {
        invalidateAll(); revision = event.revision; remoteTotal = nextTotal; remoteAggregates = nextAggregates;
        if (event.type === "delete") {
          for (const [key, block] of cache) cache.set(key, Object.freeze({ ...block, rows: Object.freeze(block.rows.filter((row) => options.getRowId(row) !== event.id)) }));
          if (selection.getState().mode === "explicit") selection.setRowSelected(event.id, false);
        }
        publish(); return "resync-required";
      }
      const incomingId = options.getRowId(event.row);
      if (options.getRowRevision && !nonNegative(options.getRowRevision(event.row))) throw new TypeError("Invalid datasource live row revision");
      for (const block of cache.values()) for (const row of block.rows) if (options.getRowId(row) === incomingId && options.getRowRevision && options.getRowRevision(event.row) <= options.getRowRevision(row)) {
        invalidateAll(); revision = event.revision; remoteTotal = nextTotal; remoteAggregates = nextAggregates; publish(); return "resync-required";
      }
      // Fence reads begun before this live change, then patch only server-certified
      // non-ordering/non-membership fields. Other changes require an authoritative read.
      generation++; for (const job of [...jobs.values()]) abortJob(job);
      for (const [key, block] of cache) cache.set(key, Object.freeze({ ...block, revision: event.revision,
        ...(!block.request.scope ? { total: nextTotal, aggregates: nextAggregates } : {}),
        rows: Object.freeze(block.rows.map((row) => options.getRowId(row) === incomingId ? event.row : row)) }));
      revision = event.revision; remoteTotal = nextTotal; remoteAggregates = nextAggregates; publish(); return "applied";
    },
    setRowSelected: (rowId, checked) => {
      assertActive(); rowIdentity(rowId); if (typeof checked !== "boolean") throw new TypeError("Datasource selection flag must be boolean");
      const state = selection.getState(), contained = state.mode === "explicit" ? checked : !checked;
      const members = state.mode === "explicit" ? state.ids : state.excludedIds;
      if (contained && !members.includes(rowId) && members.length >= maxSelected) throw new RangeError("Datasource selection limit reached");
      selection.setRowSelected(rowId, checked);
    },
    setLoadedSelection: (ids, state) => {
      assertActive(); if (!Array.isArray(ids) || ids.length > maxBlock || new Set(ids).size !== ids.length || !state || typeof state.allRowsSelected !== "boolean") throw new TypeError("Invalid loaded-row selection");
      const selected = selection.getState(), members = new Set(selected.mode === "explicit" ? selected.ids : selected.excludedIds);
      for (const rowId of ids) {
        rowIdentity(rowId); const flag = Object.hasOwn(state.rowSelection, rowId) ? state.rowSelection[rowId] : undefined;
        const checked = state.allRowsSelected ? flag !== false : flag === true;
        if (selected.mode === "explicit" ? checked : !checked) members.add(rowId); else members.delete(rowId);
      }
      if (members.size > maxSelected) throw new RangeError("Datasource selection limit reached");
      selection.setGridState(ids, state);
    },
    getIsRowSelected: (rowId) => selection.getIsRowSelected(rowId),
    selectAllMatching: () => { assertActive(); selection.selectAllMatching(); },
    clearSelection: () => { assertActive(); selection.clear(); },
    captureSelection: (settings = {}) => {
      assertActive(); if (needsRefresh) throw new Error("Refresh stale data before capturing an operation");
      const operationId = settings.operationId ?? nextIdentity(options.createOperationId), maxOperationRows = limit(settings.maxRows, 10_000, 1_000_000); id(operationId);
      return Object.freeze({ version: 1, queryId, selection: selection.getState(), observedRevision: revision, evaluation: "live-query", operationId, maxRows: maxOperationRows });
    },
    isSelectionCurrent: (operation) => !disposed && operation.queryId === queryId && operation.selection.queryKey === captured.key,
    dehydrate: () => {
      assertActive();
      if (jobs.size || failures.size || needsRefresh || [...cache.values()].some((block) => block.stale) || activeKey !== null && !cache.has(activeKey)) throw new Error("Only settled fresh datasource cache can be dehydrated");
      return Object.freeze({ version: 1, queryKey: captured.key, revision, total: remoteTotal, aggregates: remoteAggregates, activeBlock: activeRequest,
        blocks: Object.freeze([...cache.values()].map((block) => {
          const { queryId: _queryId, key: _key, request, stale: _stale, ...response } = block;
          return Object.freeze({ request, response: Object.freeze(response) });
        })) });
    },
    subscribe: (listener) => { assertActive(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => {
      if (disposed) return; disposed = true; generation++; for (const job of [...jobs.values()]) abortJob(job);
      cache.clear(); failures.clear(); queue.length = 0; listeners.clear(); selection.dispose();
      snapshot = Object.freeze({ ...snapshot, rows: Object.freeze([]), blocks: Object.freeze([]), cachedRowCount: 0, loadingCount: 0, queuedCount: 0, status: "idle", error: undefined, selection: selection.getState() });
    },
  };
  if (options.initialData !== undefined) {
    const initial = options.initialData; ownRecord(initial);
    if (Object.keys(initial).length !== 7 || Object.keys(initial).some((key) => !["version", "queryKey", "revision", "total", "aggregates", "activeBlock", "blocks"].includes(key)) ||
      initial.version !== 1 || initial.queryKey !== captured.key || initial.revision !== null && !nonNegative(initial.revision)) throw new TypeError("Invalid datasource hydration identity or revision");
    dataArray(initial.blocks, maxBlocks);
    const restoredTotal = total(initial.total), restoredAggregates = aggregates(initial.aggregates);
    const restored = new Map<string, CachedDataBlock<TRow>>(); let count = 0;
    const sameTotal = (value: DataTotal) => value.kind === restoredTotal.kind && (value.kind !== "exact" || restoredTotal.kind === "exact" && value.count === restoredTotal.count);
    const sameAggregates = (value: Readonly<Record<string, DataScalar>>) => Object.keys(value).length === Object.keys(restoredAggregates).length && Object.keys(value).every((key) => Object.hasOwn(restoredAggregates, key) && Object.is(value[key], restoredAggregates[key]));
    const rowRevisions = new Map<string, number>();
    for (const entry of initial.blocks) {
      ownRecord(entry);
      if (Object.keys(entry).length !== 2 || !Object.hasOwn(entry, "request") || !Object.hasOwn(entry, "response")) throw new TypeError("Invalid datasource hydration block");
      const request = blockRequest(entry.request, maxBlock), key = keyOf(request); ownRecord(entry.response);
      if (Object.keys(entry.response).some((name) => !["rows", "total", "revision", "hasNext", "nextCursor", "previousCursor", "rowOffset", "aggregates"].includes(name))) throw new TypeError("Invalid datasource hydration response");
      const block = validateResponse({ ...entry.response, queryId }, { block: request, key });
      if (restored.has(key) || block.revision !== initial.revision || (count += block.rows.length) > maxRows) throw new TypeError("Duplicate, inconsistent or oversized datasource hydration cache");
      if (!request.scope && (!sameTotal(block.total) || !sameAggregates(block.aggregates ?? emptyAggregates))) throw new TypeError("Inconsistent datasource hydration root metadata");
      if (options.getRowRevision) for (const row of block.rows) {
        const rowId = options.getRowId(row), value = options.getRowRevision(row);
        if (rowRevisions.has(rowId) && rowRevisions.get(rowId) !== value) throw new TypeError("Inconsistent datasource hydration row revision");
        rowRevisions.set(rowId, value);
      }
      restored.set(key, block);
    }
    const request = initial.activeBlock === null ? null : blockRequest(initial.activeBlock, maxBlock), key = request ? keyOf(request) : null;
    if (key !== null && !restored.has(key) || !restored.size && (initial.revision !== null || restoredTotal.kind !== "unknown" || Object.keys(restoredAggregates).length)) throw new TypeError("Invalid datasource hydration active block or empty metadata");
    for (const [key, block] of restored) cache.set(key, block);
    revision = initial.revision; remoteTotal = restoredTotal; remoteAggregates = restoredAggregates; activeKey = key; activeRequest = request;
  }
  selection.subscribe(publish); publish(); return controller;
}
function nextIdentity(create?: () => string): string { const value = create?.() ?? globalThis.crypto.randomUUID(); id(value); return value; }
