import { afterEach, describe, expect, it, vi } from "vitest";
import { captureDataQuery, createDataSourceController, type DataBlockRequest, type DataRequest, type DataResponse, type DataSourceControllerOptions } from "../src/datasource";
interface Item { id: string; value: number; revision: number; }
interface Query { filter: string; }
const block = (offset = 0, limit = 2): DataBlockRequest => ({ mode: "offset", offset, limit });
const cleanup: Array<() => void> = [];
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); vi.useRealTimers(); });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function response(request: DataRequest<Query>, options: Partial<DataResponse<Item>> = {}): DataResponse<Item> {
  const start = request.block.mode === "offset" ? request.block.offset : request.block.mode === "page" ? request.block.pageIndex * request.block.limit : 0;
  return { queryId: request.queryId, rows: Array.from({ length: request.block.limit }, (_, index) => ({ id: String(start + index), value: start + index, revision: 1 })),
    total: { kind: "exact", count: 10_000_000 }, revision: 1, hasNext: true, ...options };
}
function fixture(overrides: Partial<DataSourceControllerOptions<Item, Query>> = {}) {
  const getRows = vi.fn(async (request: DataRequest<Query>) => response(request));
  const options: DataSourceControllerOptions<Item, Query> = { source: { getRows }, query: { filter: "one" }, getRowId: (row) => row.id, getRowRevision: (row) => row.revision,
    maxBlockSize: 2, maxBlocks: 2, ...overrides };
  const controller = createDataSourceController(options); cleanup.push(controller.dispose); return { controller, getRows, options };
}
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };

describe("bounded remote row model", () => {
  it("loads a page and reports logical totals without allocating logical rows", async () => {
    const { controller } = fixture(); expect(controller.getState().rows).toEqual([]);
    expect(await controller.load({ mode: "page", pageIndex: 4, limit: 2 })).toMatchObject({ status: "loaded" });
    expect(controller.getState()).toMatchObject({ rows: [{ id: "8" }, { id: "9" }], total: { kind: "exact", count: 10_000_000 }, cachedRowCount: 2, status: "ready" });
    expect(Object.isFrozen(controller.getState().rows)).toBe(true);
  });
  it("coalesces duplicate requests and returns a stable snapshot between changes", async () => {
    const work = deferred<DataResponse<Item>>(); let request!: DataRequest<Query>;
    const { controller } = fixture({ source: { getRows: (input) => { request = input; return work.promise; } } });
    const initial = controller.getState(); expect(controller.getState()).toBe(initial);
    const first = controller.load(block()), second = controller.load(block()); expect(first).toBe(second); await flush();
    work.resolve(response(request)); await first; expect(await controller.load(block())).toMatchObject({ status: "cached" });
  });
  it("evicts least-recently-used inactive blocks and keeps selection independently", async () => {
    const { controller, getRows } = fixture(); await controller.load(block(0)); controller.setRowSelected("0", true);
    await controller.load(block(2), { activate: false }); controller.getBlock(block(0)); await controller.load(block(4), { activate: false });
    expect(controller.getBlock(block(2))).toBeUndefined(); expect(controller.getBlock(block(0))).toBeDefined(); expect(controller.getState().cachedRowCount).toBe(4);
    expect(controller.getIsRowSelected("0")).toBe(true); await controller.load(block(2)); expect(getRows).toHaveBeenCalledTimes(4);
  });
  it("enforces the row cap even when block count could grow", async () => {
    const { controller } = fixture({ maxBlocks: 20, maxCachedRows: 3 }); await controller.load(block(0)); await controller.load(block(2));
    expect(controller.getState().cachedRowCount).toBe(2); expect(controller.getState().blocks).toHaveLength(1);
  });
  it("keeps active display rows while prefetching and evicting an inactive block", async () => {
    const { controller } = fixture({ maxBlocks: 1 }); await controller.load(block(0)); await controller.load(block(2), { activate: false });
    expect(controller.getState().rows[0]?.id).toBe("0"); expect(controller.getState().blocks).toHaveLength(1);
  });
  it("bounds concurrent and queued requests and cancels queued jobs", async () => {
    const work = deferred<DataResponse<Item>>(); const calls: DataRequest<Query>[] = [];
    const { controller } = fixture({ concurrency: 1, maxQueuedRequests: 1, source: { getRows: (request) => { calls.push(request); return work.promise; } } });
    const first = controller.load(block(0)), second = controller.load(block(2)); await flush();
    await expect(controller.load(block(4))).rejects.toThrow(/queue limit/); expect(calls).toHaveLength(1); expect(controller.getState()).toMatchObject({ loadingCount: 1, queuedCount: 1 });
    controller.cancel(block(2)); expect(await second).toEqual({ status: "cancelled" }); work.resolve(response(calls[0]!)); await first;
  });
  it("does not let an obsolete query overwrite data, selection or totals", async () => {
    const old = deferred<DataResponse<Item>>(); let oldRequest!: DataRequest<Query>;
    const { controller } = fixture({ source: { getRows: async (request) => { if (request.query.filter === "one") { oldRequest = request; return old.promise; } return response(request, { total: { kind: "exact", count: 3 } }); } } });
    const first = controller.load(block()); await flush(); controller.selectAllMatching(); controller.setRowSelected("except", false);
    expect(controller.setQuery({ filter: "two" })).toBe(true); await controller.load(block()); old.resolve(response(oldRequest)); await first;
    expect(controller.getState()).toMatchObject({ query: { filter: "two" }, total: { kind: "exact", count: 3 }, selection: { mode: "explicit", ids: [] } });
  });
  it("refreshes an unchanged query without clearing selection", async () => {
    const { controller, getRows } = fixture(); await controller.load(block()); controller.selectAllMatching(); const queryId = controller.getState().queryId;
    expect(controller.setQuery({ filter: "one" })).toBe(false); await controller.refresh(); expect(getRows).toHaveBeenCalledTimes(2);
    expect(controller.getState().selection.mode).toBe("all-matching"); expect(controller.getState().queryId).toBe(queryId);
  });
  it("keeps accepted rows after a refresh error and retries the same block", async () => {
    let fail = false; const { controller } = fixture({ source: { getRows: async (request) => { if (fail) throw new Error("offline"); return response(request); } } });
    await controller.load(block()); fail = true; expect(await controller.refresh()).toMatchObject({ status: "error" });
    expect(controller.getState()).toMatchObject({ status: "error", rows: [{ id: "0" }, { id: "1" }] });
    fail = false; expect(await controller.retry()).toMatchObject({ status: "loaded" }); expect(controller.getState().status).toBe("ready");
  });
  it("supports unknown totals and advancing cursors", async () => {
    const { controller } = fixture({ source: { getRows: async (request) => response(request, { total: { kind: "unknown" }, nextCursor: "opaque-next" }) } });
    await controller.load({ mode: "cursor", cursor: null, limit: 2 }); expect(controller.getState().total).toEqual({ kind: "unknown" });
    expect(controller.getState().blocks[0]?.nextCursor).toBe("opaque-next");
  });
  it("isolates group and tree child blocks from root totals", async () => {
    const { controller } = fixture({ source: { getRows: async (request) => response(request, { total: { kind: "exact", count: request.block.scope ? 2 : 10_000_000 } }) } });
    await controller.load(block()); await controller.load({ ...block(), scope: { kind: "group", parentId: "g", path: ["APAC", null] } }, { activate: false });
    expect(controller.getState().total).toEqual({ kind: "exact", count: 10_000_000 });
    expect(controller.getState().blocks).toHaveLength(2); expect(controller.getBlock({ ...block(), scope: { kind: "tree", parentId: "g" } })).toBeUndefined();
  });
  it("invalidates old-revision blocks when a read observes a newer snapshot", async () => {
    let revision = 1; const { controller } = fixture({ source: { getRows: async (request) => response(request, { revision }) } });
    await controller.load(block()); revision = 2; await controller.load(block(2)); expect(controller.getState().blocks).toHaveLength(1); expect(controller.getState().revision).toBe(2);
  });
  it("does not overwrite newer snapshots with an older concurrent read", async () => {
    const old = deferred<DataResponse<Item>>(); let request!: DataRequest<Query>;
    const { controller } = fixture({ source: { getRows: async (input) => { if (input.block.mode === "offset" && input.block.offset === 0) { request = input; return old.promise; } return response(input, { revision: 3 }); } } });
    const first = controller.load(block(0)); await flush(); await controller.load(block(2)); old.resolve(response(request, { revision: 2 })); expect(await first).toEqual({ status: "stale" });
    expect(controller.getState().revision).toBe(3);
  });
  it("allows one coalesced caller to abort without cancelling another caller", async () => {
    const work = deferred<DataResponse<Item>>(); let request!: DataRequest<Query>;
    const { controller } = fixture({ source: { getRows: (input) => { request = input; return work.promise; } } });
    const abort = new AbortController(), first = controller.load(block(), { signal: abort.signal }), second = controller.load(block()); await flush(); abort.abort();
    expect(await first).toEqual({ status: "cancelled" }); expect(request.signal.aborted).toBe(false); work.resolve(response(request)); expect(await second).toMatchObject({ status: "loaded" });
  });
  it("aborts source transport after all signal waiters cancel", async () => {
    const work = deferred<DataResponse<Item>>(); let signal!: AbortSignal;
    const { controller } = fixture({ source: { getRows: (request) => { signal = request.signal; return work.promise; } } });
    const abort = new AbortController(), pending = controller.load(block(), { signal: abort.signal }); await flush(); abort.abort();
    expect(await pending).toEqual({ status: "cancelled" }); expect(signal.aborted).toBe(true); await flush(); expect(controller.getState().loadingCount).toBe(0);
  });
  it("times out uncooperative transports and ignores their late response", async () => {
    vi.useFakeTimers(); const work = deferred<DataResponse<Item>>(); let request!: DataRequest<Query>;
    const { controller } = fixture({ timeoutMs: 10, source: { getRows: (input) => { request = input; return work.promise; } } });
    const pending = controller.load(block()); await flush(); await vi.advanceTimersByTimeAsync(11); expect(await pending).toEqual({ status: "cancelled" });
    work.resolve(response(request)); await flush(); expect(controller.getState().rows).toEqual([]); expect(controller.getState().loadingCount).toBe(0);
  });
  it("disposes pending work and never calls selectors/listeners on late responses", async () => {
    const work = deferred<DataResponse<Item>>(), selector = vi.fn((row: Item) => row.id);
    const { controller } = fixture({ getRowId: selector, source: { getRows: () => work.promise } }); const listener = vi.fn(); controller.subscribe(listener);
    const pending = controller.load(block()); await flush(); controller.dispose(); controller.dispose(); listener.mockClear(); selector.mockClear();
    work.resolve({ queryId: "old", rows: [{ id: "0", value: 1, revision: 1 }], revision: 1, total: { kind: "unknown" }, hasNext: false });
    await pending; await flush(); expect(selector).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled(); expect(controller.getState().blocks).toEqual([]);
  });
  it("remains bounded through 1,000 query replacements and page loads", async () => {
    const { controller } = fixture(); for (let index = 0; index < 1000; index++) { controller.setQuery({ filter: String(index) }); await controller.load(block(index * 2)); }
    expect(controller.getState()).toMatchObject({ cachedRowCount: 2, queuedCount: 0, loadingCount: 0 }); expect(controller.getState().blocks).toHaveLength(1);
  });
});

describe("live changes and selection operations", () => {
  it("patches only contiguous server-certified updates and fences in-flight old reads", async () => {
    const { controller } = fixture(); await controller.load(block()); const queryId = controller.getState().queryId;
    expect(controller.applyLive({ type: "update", impact: "patch", queryId, revision: 2, row: { id: "0", value: 8, revision: 2 }, aggregates: { sum: 9 } })).toBe("applied");
    expect(controller.getState()).toMatchObject({ revision: 2, rows: [{ value: 8 }, { value: 1 }], aggregates: { sum: 9 } });
    expect(controller.applyLive({ type: "update", impact: "patch", queryId, revision: 1, row: { id: "0", value: 1, revision: 1 } })).toBe("ignored");
  });
  it("aborts an actual in-flight old read before applying a live patch", async () => {
    let count = 0, oldRequest!: DataRequest<Query>; const old = deferred<DataResponse<Item>>();
    const { controller } = fixture({ source: { getRows: async (request) => { if (++count === 1) return response(request); oldRequest = request; return old.promise; } } });
    await controller.load(block()); const pending = controller.load(block(), { force: true }); await flush();
    controller.applyLive({ type: "update", impact: "patch", queryId: controller.getState().queryId, revision: 2, row: { id: "0", value: 8, revision: 2 } });
    expect(oldRequest.signal.aborted).toBe(true); expect(await pending).toEqual({ status: "cancelled" }); old.resolve(response(oldRequest)); await flush();
    expect(controller.getState()).toMatchObject({ rows: [{ value: 8 }, { value: 1 }], revision: 2, loadingCount: 0 });
  });
  it("preserves a thrown undefined failure as an error state with a retry", async () => {
    let fail = true; const { controller } = fixture({ source: { getRows: async (request) => { if (fail) throw undefined; return response(request); } } });
    expect(await controller.load(block())).toEqual({ status: "error", error: undefined }); expect(controller.getState().status).toBe("error");
    fail = false; expect(await controller.retry()).toMatchObject({ status: "loaded" });
  });
  it("applies loaded selection atomically and preserves off-page exclusions", async () => {
    const { controller } = fixture({ maxSelectionIds: 1 }); await controller.load(block()); controller.selectAllMatching(); controller.setRowSelected("off-page", false);
    expect(() => controller.setLoadedSelection(["0", "1"], { rowSelection: { "0": false, "1": true }, allRowsSelected: false })).toThrow(/limit/);
    expect(controller.getState().selection).toMatchObject({ mode: "all-matching", excludedIds: ["off-page"] });
    controller.setLoadedSelection(["0", "1"], { rowSelection: { "0": true, "1": true }, allRowsSelected: false });
    expect(controller.getState().selection).toMatchObject({ mode: "all-matching", excludedIds: ["off-page"] });
  });
  it("marks revision gaps and membership/order changes stale until resynchronization", async () => {
    const { controller } = fixture(); await controller.load(block()); const queryId = controller.getState().queryId;
    expect(controller.applyLive({ type: "update", impact: "query", queryId, revision: 4, row: { id: "0", value: 8, revision: 4 } })).toBe("resync-required");
    expect(controller.getState()).toMatchObject({ needsRefresh: true, status: "stale" }); expect(() => controller.captureSelection()).toThrow(/Refresh/);
    expect(controller.applyLive({ type: "add", queryId: "different", revision: 10, row: { id: "new", value: 1, revision: 1 } })).toBe("ignored");
  });
  it("removes deleted loaded rows and explicit selected IDs immediately", async () => {
    const { controller } = fixture(); await controller.load(block()); controller.setRowSelected("0", true);
    controller.applyLive({ type: "delete", queryId: controller.getState().queryId, revision: 2, id: "0", total: { kind: "exact", count: 9_999_999 } });
    expect(controller.getState().rows.map((row) => row.id)).toEqual(["1"]); expect(controller.getIsRowSelected("0")).toBe(false); expect(controller.getState().total).toEqual({ kind: "exact", count: 9_999_999 });
  });
  it("invalidates a patch carrying an incompatible row revision", async () => {
    const { controller } = fixture(); await controller.load(block());
    expect(controller.applyLive({ type: "update", impact: "patch", queryId: controller.getState().queryId, revision: 2, row: { id: "0", value: 8, revision: 1 } })).toBe("resync-required");
  });
  it("uses immutable identical all-query selection semantics for bulk/export and retains exclusions off-page", async () => {
    const { controller } = fixture(); await controller.load(block()); controller.selectAllMatching(); controller.setRowSelected("0", false);
    const operation = controller.captureSelection({ operationId: "same-operation", maxRows: 100 });
    await controller.load(block(2)); expect(controller.getIsRowSelected("2")).toBe(true); expect(controller.getIsRowSelected("0")).toBe(false);
    expect(operation).toMatchObject({ version: 1, evaluation: "live-query", observedRevision: 1, operationId: "same-operation", maxRows: 100,
      selection: { mode: "all-matching", excludedIds: ["0"], query: { filter: "one" } } });
    expect(Object.isFrozen(operation.selection.query)).toBe(true); controller.clearSelection(); expect(operation.selection.mode).toBe("all-matching");
    controller.setQuery({ filter: "two" }); expect(controller.isSelectionCurrent(operation)).toBe(false);
  });
  it("bounds explicit IDs and exclusion lists without losing accepted selection", () => {
    const { controller } = fixture({ maxSelectionIds: 1 }); controller.setRowSelected("0", true); expect(() => controller.setRowSelected("1", true)).toThrow(/selection limit/);
    controller.selectAllMatching(); controller.setRowSelected("0", false); expect(() => controller.setRowSelected("1", false)).toThrow(/selection limit/);
    expect(controller.getState().selection).toMatchObject({ mode: "all-matching", excludedIds: ["0"] });
  });
});

describe("datasource contract validation", () => {
  it.each([
    { mode: "offset", offset: -1, limit: 2 }, { mode: "page", pageIndex: 0.5, limit: 2 }, { mode: "offset", offset: 0, limit: 3 },
    { mode: "cursor", cursor: "", limit: 2 }, { mode: "offset", offset: 0, pageIndex: 0, limit: 2 }, { mode: "offset", offset: Number.MAX_SAFE_INTEGER, limit: 2 },
    { mode: "offset", offset: 0, limit: 2, scope: { kind: "tree", parentId: "" } },
  ])("rejects invalid block requests %#", (request) => { const { controller } = fixture(); expect(() => controller.load(request as DataBlockRequest)).toThrow(); });
  it.each([
    { revision: -1 }, { total: { kind: "exact", count: Infinity } }, { queryId: "wrong" }, { rows: [{ id: "dup" }, { id: "dup" }] },
    { rows: [{ id: "__group__reserved", value: 0, revision: 1 }] }, { rows: [{ id: "a", value: 0, revision: -1 }] },
  ])("rejects invalid response data without corrupting cached rows %#", async (partial) => {
    const { controller } = fixture({ source: { getRows: async (request) => response(request, partial as Partial<DataResponse<Item>>) } });
    expect(await controller.load(block())).toMatchObject({ status: "error" }); expect(controller.getState().cachedRowCount).toBe(0);
  });
  it("rejects non-advancing cursors", async () => {
    const { controller } = fixture(); expect(await controller.load({ mode: "cursor", cursor: "same", limit: 2 })).toMatchObject({ status: "error" });
  });
  it("canonicalizes query keys without accepting cycles, getters, sparse arrays or nonfinite values", () => {
    expect(captureDataQuery({ b: 2, a: { c: 1 } }).key).toBe(captureDataQuery({ a: { c: 1 }, b: 2 }).key);
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic; expect(() => captureDataQuery(cyclic)).toThrow();
    const getter = vi.fn(() => 1), source = {}; Object.defineProperty(source, "value", { get: getter, enumerable: true });
    expect(() => captureDataQuery(source)).toThrow(); expect(getter).not.toHaveBeenCalled();
    for (const query of [{ x: undefined }, { x: Infinity }, new Array(2), { x: "x".repeat(16_001) }]) expect(() => captureDataQuery(query)).toThrow();
  });
  it.each([{ concurrency: 0 }, { maxBlocks: 1001 }, { maxCachedRows: 1 }, { timeoutMs: Infinity }, { maxSignalWaiters: 1.5 }])("rejects invalid limit configuration %#", (options) => expect(() => fixture(options)).toThrow());
});
