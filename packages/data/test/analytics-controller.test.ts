import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsController, createPivotExportSource, type AnalyticsControllerOptions } from "../src/analytics-controller";
import { addAnalyticsMetric, moveAnalyticsAxis, setAnalyticsAxisSelection, updateAnalyticsMetric } from "../src/analytics-panel";
import type { AnalyticsExporter, AnalyticsExportArtifact } from "../src/analytics-export";
interface Item { id: string; region: string; value: number; }
const rows: Item[] = [{ id: "a", region: "KR", value: 2 }, { id: "b", region: "JP", value: 3 }, { id: "c", region: "KR", value: 4 }];
const fields = ["id", "region", "value"].map((id) => ({ id, label: id, getValue: (row: Item) => row[id as keyof Item] }));
const cleanups: Array<() => void> = [];
afterEach(() => { for (const stop of cleanups.splice(0)) stop(); });
function fixture(overrides: Partial<AnalyticsControllerOptions<Item>> = {}) {
  const controller = createAnalyticsController({ fields, getRows: () => rows, configuration: { version: 1, rowAxes: ["region"], columnAxes: [], metrics: [{ id: "sum", label: "Sum", columnId: "value", operation: "sum" }] }, pageSize: 1, columnPageSize: 1, ...overrides });
  cleanups.push(controller.dispose); return controller;
}
const file: AnalyticsExportArtifact = { filename: "custom.txt", mimeType: "text/plain", bytes: new Uint8Array([1]) };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
describe("optional analytics controller", () => {
  it("keeps draft axes/metrics separate until apply and has bounded row/column paging", () => {
    const controller = fixture(), original = controller.getState().result;
    expect(controller.getState()).toMatchObject({ pageCount: 3, pageRows: [expect.any(Object)], columnPageCount: 1 });
    controller.setAxes("rows", ["id"]); expect(controller.getState().result).toBe(original); expect(controller.apply()).toBe(true);
    expect(controller.getState().result.rows).toHaveLength(4); controller.setPage(3); expect(controller.getState().pageRows[0]?.kind).toBe("grand-total");
    expect(() => controller.setPage(4)).toThrow(/page/);
    addAnalyticsMetric(controller); expect(controller.apply()).toBe(true); expect(controller.getState().pageColumns).toHaveLength(1); expect(controller.getState().columnPageCount).toBe(2);
    controller.setColumnPage(1); expect(controller.getState().pageColumns[0]?.metric.operation).toBe("count");
  });
  it("preserves the last successful result on a column explosion and recovers on reset", () => {
    const controller = fixture({ limits: { maxColumns: 1 } }), result = controller.getState().result;
    controller.setAxes("columns", ["id"]); expect(controller.apply()).toBe(false); expect(controller.getState().result).toBe(result); expect(controller.getState().error).toMatch(/column limit/);
    expect(controller.reset()).toBe(true); expect(controller.getState().error).toBeUndefined();
  });
  it("rejects forbidden schemas/metrics atomically and updates valid metric definitions", () => {
    const controller = fixture(), draft = controller.getState().draft;
    expect(controller.setAxes("rows", ["missing"])).toBe(false); expect(controller.getState().draft).toBe(draft);
    expect(updateAnalyticsMetric(controller, 0, { operation: "avg" })).toBe(true); expect(controller.apply()).toBe(true);
    expect(controller.getState().result.grandTotal.cells[controller.getState().result.columns[0]!.id]).toBe(3);
  });
  it("roundtrips applied views, rejects unsaved drafts and keeps state after storage/restore failure", () => {
    let saved: string | null = null, broken = false; const controller = fixture({ loadView: () => saved, saveView: (value) => { if (broken) throw new Error("quota"); saved = value; } });
    expect(controller.saveView()).toBe(true); controller.setAxes("rows", ["id"]); expect(controller.saveView()).toBe(false); controller.apply(); broken = true;
    const result = controller.getState().result; expect(controller.saveView()).toBe(false); expect(controller.getState().result).toBe(result);
    expect(controller.restoreView()).toBe(true); expect(controller.getState().draft.rowAxes).toEqual(["region"]);
    saved = '{"version":99}'; const restored = controller.getState().result; expect(controller.restoreView()).toBe(false); expect(controller.getState().result).toBe(restored);
  });
  it("exports the full applied pivot, including totals and header paths, independently of preview pages", async () => {
    const inspect = vi.fn<AnalyticsExporter>((document) => { expect(document.rows).toHaveLength(3); expect(document.rows.at(-1)?.[0]?.value).toBe("Grand total"); expect(document.rows.at(-1)?.[1]?.value).toBe(9); return file; });
    const delivered = vi.fn(), controller = fixture({ exporters: { custom: inspect }, onArtifact: delivered });
    controller.setPage(1); const result = await controller.export("custom"); expect(result).toBe(file); expect(delivered).toHaveBeenCalledWith(file); expect(inspect).toHaveBeenCalledTimes(1);
    expect(createPivotExportSource(controller.getState().result, fields).scope).toBe("pivot");
  });
  it("keeps sensitive raw fields out of custom exporters", async () => {
    const secret = vi.fn(), inspect = vi.fn<AnalyticsExporter>((document) => { expect(document.columns.map((column) => column.id)).toEqual(["value"]); return file; });
    const controller = fixture({ exporters: { custom: inspect }, exportColumns: [{ id: "value", label: "Value", type: "number", getValue: (row) => row.value }, { id: "secret", label: "Secret", sensitive: true, getValue: secret }] });
    await controller.export("custom", "records"); expect(secret).not.toHaveBeenCalled();
  });
  it("does not export a stale computed pivot when the owner replaced data without refresh", async () => {
    let revision = "one"; const controller = fixture({ getRevision: () => revision }); revision = "two";
    await expect(controller.export("csv")).rejects.toThrow(/refresh/); expect(controller.refresh()).toBe(true); expect(await controller.export("csv")).toMatchObject({ filename: expect.stringContaining("csv") });
  });
  it("preserves draft settings when accepted source data refreshes", () => {
    const controller = fixture(); controller.setAxes("rows", ["id"]); expect(controller.refresh()).toBe(true);
    expect(controller.getState().draft.rowAxes).toEqual(["id"]); expect(controller.getState().result.configuration.rowAxes).toEqual(["region"]);
  });
  it("reorders axis priority accessibly and preserves that priority when selection changes", () => {
    const controller = fixture(); controller.setAxes("rows", ["id", "region"]); expect(moveAnalyticsAxis(controller, "rows", 1, "up")).toBe(true);
    expect(controller.getState().draft.rowAxes).toEqual(["region", "id"]); setAnalyticsAxisSelection(controller, "rows", ["id", "region", "value"]);
    expect(controller.getState().draft.rowAxes).toEqual(["region", "id", "value"]);
  });
  it("cancels prior exports on apply without letting an older error replace the new pivot status", async () => {
    const ready = deferred<void>(), pending = deferred<AnalyticsExportArtifact>(), delivered = vi.fn();
    const controller = fixture({ exporters: { slow: () => { ready.resolve(); return pending.promise; } }, onArtifact: delivered });
    const work = controller.export("slow"); await ready.promise; controller.setAxes("rows", ["id"]); controller.apply();
    await expect(work).rejects.toMatchObject({ name: "AbortError" }); pending.resolve(file); expect(controller.getState().message).toBe("Pivot applied"); expect(controller.getState().error).toBeUndefined(); expect(delivered).not.toHaveBeenCalled();
  });
  it("reports exporter failures, allows another export and suppresses callbacks after disposal", async () => {
    let failed = true; const controller = fixture({ exporters: { custom: () => { if (failed) throw new Error("encoder"); return file; } } });
    await expect(controller.export("custom")).rejects.toThrow("encoder"); expect(controller.getState().error).toBe("encoder"); failed = false; await controller.export("custom"); expect(controller.getState().error).toBeUndefined();
    const ready = deferred<void>(), pending = deferred<AnalyticsExportArtifact>(), callback = vi.fn(), second = fixture({ exporters: { slow: () => { ready.resolve(); return pending.promise; } }, onArtifact: callback });
    const work = second.export("slow"); await ready.promise; second.dispose(); await expect(work).rejects.toThrow(); pending.resolve(file); expect(callback).not.toHaveBeenCalled();
  });
});
