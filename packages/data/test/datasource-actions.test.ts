import { afterEach, describe, expect, it, vi } from "vitest";
import { createDataSourceController, type DataSelectionSnapshot } from "../src/datasource";
import { createDataSourceActions } from "../src/datasource-actions";
import { getFirstDataBlock, getLastDataBlock, getNextDataBlock, getPreviousDataBlock, getRootDataBlock } from "../src/datasource-navigation";
const cleanup: Array<() => void> = []; afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); vi.useRealTimers(); });
function fixture() {
  const controller = createDataSourceController({ query: { filter: "all" }, getRowId: (row: { id: string }) => row.id, maxBlockSize: 2,
    source: { getRows: async (request) => ({ queryId: request.queryId, rows: [{ id: "a" }, { id: "b" }], total: { kind: "exact" as const, count: 10 }, revision: 1, hasNext: true,
      ...(request.block.mode === "cursor" ? { nextCursor: "next", previousCursor: null } : {}) }) } });
  cleanup.push(controller.dispose); return controller;
}
describe("remote selection actions", () => {
  it("retains the exact immutable operation snapshot on retry after a lost response", async () => {
    const controller = fixture(); controller.selectAllMatching(); controller.setRowSelected("excluded", false);
    const calls: DataSelectionSnapshot<{ filter: string }>[] = []; let fail = true;
    const actions = createDataSourceActions(controller, { bulk: async (selection) => { calls.push(selection); if (fail) throw new Error("Lost response"); return { message: "2 updated" }; } }); cleanup.push(actions.dispose);
    expect((await actions.run("bulk")).status).toBe("error"); controller.setRowSelected("different", false); fail = false;
    expect((await actions.retry())?.status).toBe("success"); expect(calls[1]).toBe(calls[0]); expect(calls[1]?.selection).toMatchObject({ excludedIds: ["excluded"] });
  });
  it("shares bulk and export selection semantics while each new operation has its own ID", async () => {
    const controller = fixture(); controller.setRowSelected("a", true); const calls: DataSelectionSnapshot<{ filter: string }>[] = [];
    const handler = async (selection: DataSelectionSnapshot<{ filter: string }>) => { calls.push(selection); return { message: "done" }; };
    const actions = createDataSourceActions(controller, { bulk: handler, export: handler }); cleanup.push(actions.dispose);
    await actions.run("bulk"); await actions.run("export"); expect(calls[0]?.selection).toEqual(calls[1]?.selection); expect(calls[0]?.operationId).not.toBe(calls[1]?.operationId);
  });
  it("coalesces duplicate operation clicks and aborts/fences query changes", async () => {
    const controller = fixture(); controller.selectAllMatching(); let signal!: AbortSignal, resolve!: (value: { message: string }) => void;
    const work = new Promise<{ message: string }>((done) => { resolve = done; });
    const actions = createDataSourceActions(controller, { bulk: async (_selection, context) => { signal = context.signal; return work; } }); cleanup.push(actions.dispose);
    const first = actions.run("bulk"), second = actions.run("bulk"); expect(first).toBe(second); await Promise.resolve(); await Promise.resolve();
    controller.setQuery({ filter: "new" }); expect(signal.aborted).toBe(true); resolve({ message: "old" }); await first;
    expect(actions.getState()).toMatchObject({ status: "idle", result: null, canRetry: false });
  });
  it("disposes idempotently without publishing a late operation result", async () => {
    const controller = fixture(); controller.setRowSelected("a", true); let resolve!: (value: { message: string }) => void;
    const actions = createDataSourceActions(controller, { export: () => new Promise((done) => { resolve = done; }) }); cleanup.push(actions.dispose);
    const listener = vi.fn(); actions.subscribe(listener); const work = actions.run("export"); await Promise.resolve(); await Promise.resolve(); actions.dispose(); actions.dispose(); listener.mockClear();
    resolve({ message: "late" }); await work; expect(listener).not.toHaveBeenCalled(); expect(actions.getState().result).toBeNull();
  });
  it("rejects unselected and unconfigured operations", () => {
    const controller = fixture(), actions = createDataSourceActions(controller, {}); cleanup.push(actions.dispose);
    expect(() => actions.run("bulk")).toThrow(/Select/); controller.setRowSelected("a", true); expect(() => actions.run("bulk")).toThrow(/not configured/);
  });
});
describe("data position navigation", () => {
  it("navigates arbitrary offsets and exact totals without treating them as page indexes", async () => {
    const controller = fixture(); await controller.load({ mode: "offset", offset: 3, limit: 2 }); const state = controller.getState();
    expect(getPreviousDataBlock(state)).toEqual({ mode: "offset", offset: 1, limit: 2 }); expect(getNextDataBlock(state)).toEqual({ mode: "offset", offset: 5, limit: 2 });
    expect(getFirstDataBlock(state)).toEqual({ mode: "offset", offset: 0, limit: 2 }); expect(getLastDataBlock(state)).toEqual({ mode: "offset", offset: 8, limit: 2 });
  });
  it("keeps cursors opaque and never invents a last cursor", async () => {
    const controller = fixture(); await controller.load({ mode: "cursor", cursor: "opaque", limit: 2 }); const state = controller.getState();
    expect(getNextDataBlock(state)).toEqual({ mode: "cursor", cursor: "next", limit: 2 }); expect(getPreviousDataBlock(state)).toEqual({ mode: "cursor", cursor: null, limit: 2 }); expect(getLastDataBlock(state)).toBeNull();
  });
  it("returns from a child scope to the first root block", async () => {
    const controller = fixture(); await controller.load({ mode: "page", pageIndex: 2, limit: 2, scope: { kind: "tree", parentId: "root" } });
    expect(getRootDataBlock(controller.getState())).toEqual({ mode: "page", pageIndex: 0, limit: 2 });
  });
});
