import { afterEach, describe, expect, it, vi } from "vitest";
import { createDataSourceController, type DataRequest, type DataSourceControllerOptions, type DataSourceHydration } from "../src/datasource";
interface Row { id: string; revision: number; label: string; }
interface Query { filter: string; }
const owners: Array<() => void> = [];
afterEach(() => { for (const dispose of owners.splice(0)) dispose(); });
const block = (offset = 0) => ({ mode: "offset" as const, offset, limit: 2 });
function owner(extra: Partial<DataSourceControllerOptions<Row, Query>> = {}) {
  const getRows = vi.fn(async (request: DataRequest<Query>) => ({ queryId: request.queryId, revision: 3,
    rows: Array.from({ length: 2 }, (_, index) => ({ id: String((request.block.mode === "offset" ? request.block.offset : 0) + index), revision: 2, label: "00123 김 / 日本語 / مرحبا" })),
    total: { kind: "exact" as const, count: request.block.scope ? 2 : 10_000_000 }, aggregates: { count: request.block.scope ? 2 : 10_000_000 }, hasNext: !request.block.scope }));
  const controller = createDataSourceController<Row, Query>({ query: { filter: "one" }, getRowId: (row) => row.id, getRowRevision: (row) => row.revision,
    source: { getRows }, maxBlocks: 2, maxBlockSize: 2, maxCachedRows: 4, ...extra });
  owners.push(controller.dispose); return { controller, getRows };
}
async function prefetched() { const source = owner(); await source.controller.load(block()); await source.controller.load(block(2), { activate: false }); return source; }
const transport = (value: DataSourceHydration<Row>): DataSourceHydration<Row> => JSON.parse(JSON.stringify(value));
describe("request-owned datasource prefetch hydration", () => {
  it("restores first render synchronously with the same rows, metadata, active segment and LRU order", async () => {
    const source = await prefetched(), initialData = transport(source.controller.dehydrate()), client = owner({ initialData });
    expect(client.getRows).not.toHaveBeenCalled(); const before = source.controller.getState(), after = client.controller.getState();
    for (const name of ["rows", "total", "revision", "aggregates", "activeBlock", "status", "cachedRowCount"] as const) expect(after[name]).toEqual(before[name]);
    expect(after.blocks.map((entry) => entry.request)).toEqual(before.blocks.map((entry) => entry.request));
    expect(after.queryId).not.toBe(before.queryId); expect(after.blocks.every((entry) => entry.queryId === after.queryId)).toBe(true);
    expect(after.generation).toBe(0); expect(after.loadingCount).toBe(0); expect(after.queuedCount).toBe(0); expect(after.error).toBeUndefined();
    expect(await client.controller.load(block())).toMatchObject({ status: "cached" }); expect(client.getRows).not.toHaveBeenCalled();
    await client.controller.load(block(4), { activate: false }); expect(client.controller.getBlock(block(2))).toBeUndefined(); expect(client.controller.getState().rows[0]?.id).toBe("0");
  });
  it("omits server identity, callbacks and selection and fences an old server operation after rebinding", async () => {
    const { controller } = await prefetched(); controller.selectAllMatching(); controller.setRowSelected("1", false); const old = controller.captureSelection();
    const initialData = controller.dehydrate(), serialized = JSON.stringify(initialData), client = owner({ initialData });
    expect(Object.keys(initialData).sort()).toEqual(["activeBlock", "aggregates", "blocks", "queryKey", "revision", "total", "version"]);
    expect(serialized).not.toContain("queryId"); expect(serialized).not.toContain("operationId"); expect(serialized).not.toContain("excludedIds");
    expect(client.controller.getState().selection).toMatchObject({ mode: "explicit", ids: [] }); expect(client.controller.isSelectionCurrent(old)).toBe(false);
    const changed = vi.fn(); client.controller.subscribe(changed); expect(changed).not.toHaveBeenCalled();
    await client.controller.refresh(); expect(client.getRows).toHaveBeenCalledOnce(); expect(client.getRows.mock.calls[0]![0].queryId).toBe(client.controller.getState().queryId);
  });
  it("retains root metadata even when only a child segment remains in a bounded cache", async () => {
    const source = owner({ maxBlocks: 1 }); await source.controller.load(block());
    await source.controller.load({ ...block(), scope: { kind: "tree", parentId: "parent" } });
    const client = owner({ maxBlocks: 1, initialData: transport(source.controller.dehydrate()) });
    expect(client.controller.getState()).toMatchObject({ total: { kind: "exact", count: 10_000_000 }, aggregates: { count: 10_000_000 }, activeBlock: { scope: { kind: "tree" } } });
    expect(client.controller.getState().blocks[0]?.total).toEqual({ kind: "exact", count: 2 });
  });
  it("supports empty and inactive-prefetch snapshots without starting automatic work", async () => {
    const empty = owner(), client = owner({ initialData: transport(empty.controller.dehydrate()) }); expect(client.controller.getState().status).toBe("idle");
    await empty.controller.load(block(), { activate: false }); const warm = owner({ initialData: transport(empty.controller.dehydrate()) });
    expect(warm.controller.getState()).toMatchObject({ rows: [], activeBlock: null, status: "idle", cachedRowCount: 2 }); expect(warm.getRows).not.toHaveBeenCalled();
  });
  it("freezes DTO structure while retaining product-owned row values", async () => {
    const { controller } = await prefetched(), data = controller.dehydrate();
    expect(Object.isFrozen(data)).toBe(true); expect(Object.isFrozen(data.blocks)).toBe(true); expect(Object.isFrozen(data.blocks[0])).toBe(true); expect(Object.isFrozen(data.blocks[0]?.response)).toBe(true);
    expect(Object.isFrozen(data.blocks[0]?.response.rows)).toBe(true); expect(data.blocks[0]?.response.rows[0]).toBe(controller.getState().rows[0]);
  });
  it("rejects unfinished, failed, invalidated or disposed owner snapshots", async () => {
    let done!: () => void; const pending = owner({ source: { getRows: () => new Promise((resolve) => { done = () => resolve({ queryId: pending.controller.getState().queryId, rows: [], total: { kind: "unknown" }, revision: 1, hasNext: false }); }) } });
    const work = pending.controller.load(block()); expect(() => pending.controller.dehydrate()).toThrow(/settled fresh/); await Promise.resolve(); done(); await work;
    const source = await prefetched(); source.controller.invalidate(); expect(() => source.controller.dehydrate()).toThrow(/settled fresh/);
    const failed = owner({ source: { getRows: async () => { throw new Error("offline"); } } }); await failed.controller.load(block()); expect(() => failed.controller.dehydrate()).toThrow(/settled fresh/);
    source.controller.dispose(); expect(() => source.controller.dehydrate()).toThrow(/disposed/);
  });
  it.each(["version", "query", "duplicate", "blocks", "revision", "active", "root-total", "root-aggregate", "row-id", "row-revision", "response-id", "rows", "missing-metadata"])("rejects malformed or mismatched hydration: %s", async (kind) => {
    const { controller } = await prefetched(); const original = transport(controller.dehydrate());
    let value: unknown = original;
    if (kind === "version") value = { ...original, version: 2 };
    if (kind === "query") value = { ...original, queryKey: '{"filter":"two"}' };
    if (kind === "duplicate") value = { ...original, blocks: [original.blocks[0], original.blocks[0]] };
    if (kind === "blocks") value = { ...original, blocks: [...original.blocks, original.blocks[0]] };
    if (kind === "revision") value = { ...original, revision: 4 };
    if (kind === "active") value = { ...original, activeBlock: block(8) };
    if (kind === "root-total") value = { ...original, total: { kind: "exact", count: 2 } };
    if (kind === "root-aggregate") value = { ...original, aggregates: { count: 7 } };
    if (kind === "row-id" || kind === "row-revision") {
      const rows = [{ ...original.blocks[0]!.response.rows[0]!, ...(kind === "row-id" ? { id: "__group__reserved" } : { revision: -1 }) }];
      value = { ...original, blocks: [{ ...original.blocks[0], response: { ...original.blocks[0]!.response, rows } }] };
    }
    if (kind === "response-id") value = { ...original, blocks: [{ ...original.blocks[0], response: { ...original.blocks[0]!.response, queryId: "old-server" } }] };
    if (kind === "rows") value = { ...original, blocks: [{ ...original.blocks[0], response: { ...original.blocks[0]!.response, rows: new Array(2) } }] };
    if (kind === "missing-metadata") { const { aggregates: _aggregate, ...missing } = original; value = missing; }
    expect(() => owner({ initialData: value as DataSourceHydration<Row> })).toThrow();
  });
  it("rejects a cache that exceeds the client's stricter row budget or has inconsistent overlapping row revisions", async () => {
    const { controller } = await prefetched(), data = transport(controller.dehydrate()); expect(() => owner({ maxCachedRows: 2, initialData: data })).toThrow(/oversized/);
    const second = { ...data.blocks[1]!, response: { ...data.blocks[1]!.response, rows: [{ ...data.blocks[0]!.response.rows[0]!, revision: 3 }] } };
    expect(() => owner({ initialData: { ...data, blocks: [data.blocks[0]!, second] } })).toThrow(/row revision/);
  });
});
