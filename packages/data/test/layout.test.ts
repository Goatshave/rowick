import { afterEach, describe, expect, it, vi } from "vitest";
import { createGrid, type AnyColumnDef, type GridOptions } from "@rowick/core";
import { createGridLayoutController, type GridLayoutOptions } from "../src/layout-controller";
import { createRowEditingController } from "../src/row-editing";
import { LayoutHeightIndex } from "../src/layout-height";
import { layoutClipboardText, parseLayoutClipboardPayload, parseLayoutClipboardText } from "../src/layout-clipboard";
const cleanup: Array<() => void> = []; afterEach(() => { for (const stop of cleanup.splice(0)) stop(); });
interface Item { id: string; name: string; amount: number | null; }
const columns: AnyColumnDef<Item>[] = [{ accessorKey: "name", enableEditing: true }, { accessorKey: "amount", enableEditing: true,
  editValueParser: (text) => text === "" ? null : Number(text), validateEditValue: (value) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0 || "Invalid amount" }];
function fixture(configuration: { count?: number; layout?: GridLayoutOptions<Item>; grid?: Partial<GridOptions<Item>>; readOnlyB?: boolean; } = {}) {
  let rows: readonly Item[] = Array.from({ length: configuration.count ?? 5 }, (_, index) => ({ id: String(index), name: `Row ${index}`, amount: index }));
  const grid = createGrid<Item>({ data: rows, columns, getRowId: (row) => row.id, initialState: { pagination: { pageIndex: 0, pageSize: configuration.count ?? 5 } }, ...configuration.grid });
  const editor = createRowEditingController<Item>({ getRow: (id) => rows.find((row) => row.id === id), getRowId: (row) => row.id, getValue: (row, id) => row[id as keyof Item],
    applyValues: (row, values) => ({ ...row, ...values }), canEdit: (id) => !(configuration.readOnlyB && id === "1"), accept: (id, row) => { rows = rows.map((source) => source.id === id ? row : source); grid.setOptions((options) => ({ ...options, data: rows })); } });
  const acceptReorder = vi.fn((next: readonly Item[]) => { rows = next; grid.setOptions((options) => ({ ...options, data: rows })); });
  const layout = createGridLayoutController(grid, { editing: editor, acceptReorder, ...configuration.layout }); cleanup.push(() => { layout.dispose(); editor.dispose(); });
  return { grid, editor, layout, acceptReorder, getRows: () => rows };
}
const cell = (rowId: string, columnId = "name") => ({ rowId, columnId });
const merge = { rowIds: ["0", "1"], columnIds: ["name"] };
describe("variable height layout index", () => {
  it("matches independent prefix sums and offset lookup after sparse measurements", () => {
    const values = Array.from({ length: 1000 }, (_, index) => 20 + index % 7), heights = new LayoutHeightIndex(values);
    for (let index = 0; index < 1000; index += 13) { values[index] = 77; heights.set(index, 77); }
    for (let index = 0; index <= 1000; index += 11) expect(heights.offset(index)).toBe(values.slice(0, index).reduce((a, b) => a + b, 0));
    for (let offset = 0; offset < heights.total; offset += 97) { let expected = 0, sum = values[0]!; while (sum <= offset && expected < values.length - 1) sum += values[++expected]!; expect(heights.find(offset)).toBe(expected); }
  });
  it.each([0, -1, Infinity, NaN, 10_001])("rejects invalid heights %s", (height) => expect(() => new LayoutHeightIndex([height])).toThrow());
});
describe("advanced row layout", () => {
  it("keeps a 10k row viewport bounded and handles sparse measured heights", () => {
    const { layout } = fixture({ count: 10_000 }); const first = layout.getView({ scrollTop: 0, height: 440 });
    expect(first.center.length).toBeLessThan(20); expect(first.rowCount).toBe(10_000); expect(first.afterHeight).toBeGreaterThan(400_000);
    layout.measure(first.center[0]!.key, 100); expect(layout.getScrollOffset("1")).toBe(100);
    const end = layout.getView({ scrollTop: 439_900, height: 440 }); expect(end.center.length).toBeLessThan(20); expect(end.center.at(-1)?.row.id).toBe("9999");
  });
  it("pins rows around a distinct bounded center and retains pin IDs across filtering", () => {
    const { layout, grid } = fixture(); layout.pin("0", "top"); layout.pin("4", "bottom");
    const view = layout.getView({ scrollTop: 0, height: 440 }); expect(view.top.map((item) => item.row.id)).toEqual(["0"]); expect(view.bottom.map((item) => item.row.id)).toEqual(["4"]);
    expect(view.center.map((item) => item.row.id)).toEqual(["1", "2", "3"]); expect([...view.top, ...view.center, ...view.bottom].map((item) => item.rowIndex)).toEqual([0, 1, 2, 3, 4]);
    grid.setGlobalFilter("Row 2"); expect(layout.getView({ scrollTop: 0, height: 440 }).top).toEqual([]); expect(layout.getState().topPins).toEqual(["0"]);
    grid.setGlobalFilter(""); expect(layout.getView({ scrollTop: 0, height: 440 }).top[0]?.row.id).toBe("0");
  });
  it("expands variable-height details and rejects excessive pinned content atomically", () => {
    const { layout } = fixture(); layout.toggleDetail("0"); const view = layout.getView({ scrollTop: 0, height: 440 });
    expect(view.center[1]?.kind).toBe("detail"); expect(view.rowCount).toBe(6); layout.measure(view.center[1]!.key, 180); expect(layout.getScrollOffset("1")).toBe(224);
    layout.getView({ scrollTop: 0, height: 200 }); expect(() => layout.pin("0", "top")).toThrow(/viewport/); expect(layout.getState().topPins).toEqual([]);
    layout.collapseDetails(); layout.pin("0", "top"); expect(layout.getView({ scrollTop: 0, height: 200 }).top).toHaveLength(1);
  });
  it("bounds pin count and validates initial configuration before subscribing", () => {
    const { layout } = fixture({ layout: { maxPinnedRows: 1 } }); layout.pin("0", "top"); expect(() => layout.pin("1", "top")).toThrow(); expect(layout.getState().topPins).toEqual(["0"]);
    const grid = createGrid({ data: [{ id: "a" }], columns: [{ accessorKey: "id" }], getRowId: (row) => row.id }), subscribe = vi.spyOn(grid, "subscribe");
    expect(() => createGridLayoutController(grid, { getRowHeight: () => NaN })).toThrow(); expect(subscribe).not.toHaveBeenCalled();
  });
  it("normalizes merge focus, expands selection and keeps anchors mounted at a viewport boundary", () => {
    const { layout } = fixture({ count: 100, layout: { spans: [merge] } }); layout.focus(cell("1")); expect(layout.getState().focusedCell).toEqual(cell("0"));
    expect(layout.getIsCellSelected("1", "name")).toBe(true); expect(layout.getCellSpan("1", "name")).toMatchObject({ covered: true, anchor: cell("0"), rowSpan: 2 });
    const copy = parseLayoutClipboardPayload(layout.copy().payload); expect(copy.blocks[0]?.values).toEqual([["Row 0"], [""]]);
    const view = layout.getView({ scrollTop: 45, height: 44, overscan: 0 }); expect(view.center[0]?.row.id).toBe("0"); expect(view.center[1]?.row.id).toBe("1");
    layout.moveFocus("down"); expect(layout.getState().focusedCell).toEqual(cell("2"));
  });
  it("pins a merged row block atomically and prevents vertical merges crossing details", () => {
    const { layout } = fixture({ layout: { spans: [merge] } }); layout.pin("0", "top"); expect(layout.getState().topPins).toEqual(["0", "1"]);
    expect(() => layout.toggleDetail("0")).toThrow(/detail/); expect(layout.getState().detailIds).toEqual([]);
    layout.setSpans([]); layout.toggleDetail("0"); expect(layout.getState().detailIds).toEqual(["0"]);
  });
  it.each([
    [{ rowIds: ["0", "2"], columnIds: ["name"] }],
    [{ rowIds: ["0"], columnIds: ["name", "name"] }],
    [merge, merge], [{ rowIds: ["0"], columnIds: ["unknown"] }],
  ].map((spans) => ({ spans })))("rejects invalid/noncontiguous/overlapping merges atomically %#", ({ spans }) => {
    const { layout } = fixture(); expect(() => layout.setSpans(spans)).toThrow(); expect(layout.getCellSpan("0", "name")).toBeUndefined();
  });
  it("rejects column pin boundary merges and fails visibly on a partial filtered rectangle", () => {
    const { layout, grid } = fixture(); grid.pinColumn("name", "left"); expect(() => layout.setSpans([{ rowIds: ["0"], columnIds: ["name", "amount"] }])).toThrow(/pinned/);
    layout.setSpans([merge]); grid.setGlobalFilter("Row 0"); expect(() => layout.getView({ scrollTop: 0, height: 400 })).toThrow(/available/);
    layout.setSpans([]); expect(layout.getView({ scrollTop: 0, height: 400 }).center).toHaveLength(1);
  });
  it("copies configured spans and does not allow caller mutation to change cached merges", () => {
    const spans = [{ rowIds: ["0", "1"], columnIds: ["name"] }], { layout } = fixture({ layout: { spans } }); spans[0]!.rowIds[1] = "4";
    expect(layout.getCellSpan("1", "name")?.covered).toBe(true); expect(layout.getCellSpan("4", "name")).toBeUndefined();
  });
  it("extends one active range while retaining independent ranges and toggles identical additive ranges", () => {
    const { layout } = fixture(); layout.focus(cell("0")); layout.focus(cell("3"), false, true); layout.moveFocus("down", true);
    expect(layout.getState().ranges).toHaveLength(2); expect(layout.getIsCellSelected("0", "name")).toBe(true); expect(layout.getIsCellSelected("4", "name")).toBe(true);
    layout.select(cell("0"), cell("0"), true); expect(layout.getState().ranges).toHaveLength(1);
  });
  it("preserves multiple block shapes through custom clipboard data and one undo boundary", () => {
    const { layout, editor } = fixture(); layout.select(cell("0")); layout.select(cell("2"), cell("2"), true); const copied = layout.copy();
    expect(parseLayoutClipboardPayload(copied.payload).blocks).toHaveLength(2); layout.select(cell("1")); layout.select(cell("3"), cell("3"), true);
    expect(layout.paste(copied.text, copied.payload)).toMatchObject({ committed: 2, blocked: false }); expect(editor.getValue("1", "name")).toBe("Row 0"); expect(editor.getValue("3", "name")).toBe("Row 2");
    expect(layout.undo()).toBe(true); expect(editor.getValue("1", "name")).toBe("Row 1"); expect(editor.getValue("3", "name")).toBe("Row 3"); expect(layout.redo()).toBe(true);
  });
  it("reports invalid/read-only cells while accepting the rest of a paste", () => {
    const { layout, editor } = fixture({ readOnlyB: true }); layout.select(cell("0", "amount"));
    expect(layout.paste("4\n5\n-2")).toMatchObject({ attempted: 3, committed: 1, skipped: [expect.objectContaining({ reason: expect.stringContaining("Read-only") }), expect.objectContaining({ reason: "Invalid amount" })] });
    expect(editor.getValue("0", "amount")).toBe(4); expect(editor.getValue("1", "amount")).toBe(1); expect(editor.getValue("2", "amount")).toBe(2);
  });
  it("preserves explicit null parser output and blocks cut if a write or read-only check fails", () => {
    const { layout, editor } = fixture(); layout.select(cell("0", "amount")); expect(layout.cut(() => {})).toMatchObject({ committed: 1 }); expect(editor.getValue("0", "amount")).toBeNull();
    layout.undo(); expect(() => layout.cut(() => { throw new Error("Clipboard denied"); })).toThrow(/denied/); expect(editor.getValue("0", "amount")).toBe(0);
    const denied = fixture({ readOnlyB: true }); denied.layout.select(cell("0"), cell("1")); expect(denied.layout.cut(() => {})).toMatchObject({ committed: 0, blocked: true }); expect(denied.editor.getValue("0", "name")).toBe("Row 0");
  });
  it("blocks out-of-bounds paste and capped fill without dropping input", () => {
    const { layout, editor } = fixture({ layout: { maxClipboardCells: 2 } }); layout.select(cell("0"), cell("2")); expect(() => layout.fill("all")).toThrow(/limit/); expect(editor.getState().dirtyRowCount).toBe(0);
    layout.select(cell("4")); expect(() => layout.paste("x\ny")).toThrow(/boundary/);
  });
  it("fences expired edit sessions and retains invalid input for correction", () => {
    const { layout, editor } = fixture(); layout.beginEdit(cell("0", "amount")); const old = layout.getState().editing!.token; layout.setEditInput("bad"); expect(layout.commitEdit(old)).toBe(false);
    expect(layout.getState().editing).toMatchObject({ value: "bad", error: "Invalid amount" }); layout.cancelEdit(); layout.beginEdit(cell("1", "amount")); const fresh = layout.getState().editing!.token;
    layout.setEditInput("8"); expect(layout.commitEdit(old)).toBe(false); expect(layout.getState().editing?.token).toBe(fresh); expect(layout.commitEdit(fresh)).toBe(true); expect(editor.getValue("1", "amount")).toBe(8);
  });
  it("preserves a new editor opened by a batch callback", () => {
    const { layout, editor } = fixture(); layout.beginEdit(cell("0")); const old = layout.getState().editing!.token; let opened = false;
    const stop = editor.subscribe(() => { if (!opened) { opened = true; layout.beginEdit(cell("1")); } }); layout.setEditInput("new"); layout.commitEdit(old); stop();
    expect(layout.getState().editing?.coordinate).toEqual(cell("1"));
  });
  it("preserves newer input submitted to the same editor from a draft callback", () => {
    const { layout, editor } = fixture(); layout.beginEdit(cell("0")); layout.setEditInput("submitted"); let changed = false;
    const stop = editor.subscribe(() => { if (!changed) { changed = true; layout.setEditInput("newer callback input"); } });
    expect(layout.commitEdit()).toBe(true); stop();
    expect(editor.getValue("0", "name")).toBe("submitted"); expect(layout.getState().editing?.value).toBe("newer callback input");
  });
  it("keeps inline raw input visible until editing finishes before structural layout changes", () => {
    const { layout } = fixture(); layout.beginEdit(cell("1")); layout.setEditInput("Uncommitted composition"); const session = layout.getState().editing;
    expect(() => layout.setSpans([merge])).toThrow(/Finish or cancel/); expect(() => layout.pin("1", "top")).toThrow(/Finish or cancel/);
    expect(() => layout.toggleDetail("1")).toThrow(/Finish or cancel/); expect(layout.getCanReorder()).toBe(false); expect(() => layout.reorder("1", "3")).toThrow();
    expect(layout.getState().editing).toBe(session); expect(layout.getState().topPins).toEqual([]); expect(layout.getCellSpan("1", "name")).toBeUndefined();
    layout.cancelEdit(); expect(layout.getCanReorder()).toBe(true); layout.setSpans([merge]); expect(layout.getCellSpan("1", "name")?.covered).toBe(true);
  });
  it("rejects parser callbacks that replace schema or change newer editing intent", () => {
    const { layout, grid, editor } = fixture();
    grid.setOptions((options) => ({ ...options, columns: [{ accessorKey: "name", enableEditing: true, editValueParser: (raw) => {
      grid.setOptions((current) => ({ ...current, columns: [{ accessorKey: "name", enableEditing: false }] })); return raw;
    } }] }));
    layout.select(cell("0")); expect(() => layout.paste("forbidden")).toThrow(/changed/); expect(editor.getValue("0", "name")).toBe("Row 0");
    grid.setOptions((options) => ({ ...options, columns: [{ accessorKey: "name", enableEditing: true, editValueParser: (raw) => { layout.setEditInput("newer parser input"); return raw; } }] }));
    layout.beginEdit(cell("0")); layout.setEditInput("old"); expect(() => layout.commitEdit()).toThrow(/changed/);
    expect(editor.getValue("0", "name")).toBe("Row 0"); expect(layout.getState().editing?.value).toBe("newer parser input");
  });
  it("fails closed for async cut writers, including rejected writes", async () => {
    const { layout, editor } = fixture(); layout.select(cell("0"));
    expect(() => layout.cut(async () => { throw new Error("Clipboard denied"); })).toThrow(/synchronous/);
    await Promise.resolve(); expect(editor.getValue("0", "name")).toBe("Row 0");
    expect(() => layout.cut(() => Promise.resolve())).toThrow(/synchronous/); expect(editor.getState().dirtyRowCount).toBe(0);
  });
  it("reorders immutable data, preserves focused identity, and moves a merged block together", () => {
    const { layout, getRows } = fixture({ layout: { spans: [merge] } }); layout.focus(cell("0")); layout.reorder("0", "3", "after");
    expect(getRows().map((row) => row.id)).toEqual(["2", "3", "0", "1", "4"]); expect(layout.getState().focusedCell).toEqual(cell("0")); expect(layout.getCellSpan("1", "name")?.covered).toBe(true);
    layout.setSpans([]); layout.moveRow("4", -1); expect(getRows().map((row) => row.id)).toEqual(["2", "3", "0", "4", "1"]);
  });
  it("rejects reordering ambiguous/dirty/server views and unstable positional identities", () => {
    const { layout, grid, editor, acceptReorder } = fixture(); grid.setSorting([{ id: "name" }]); expect(layout.getCanReorder()).toBe(false); expect(() => layout.reorder("0", "1")).toThrow();
    grid.setSorting([]); editor.setValue("0", "name", "dirty"); expect(layout.getCanReorder()).toBe(false); expect(acceptReorder).not.toHaveBeenCalled();
    const remote = fixture({ grid: { manualPagination: true } }); expect(remote.layout.getCanReorder()).toBe(false);
    const positional = fixture({ grid: { getRowId: (_row, index) => String(index) } }); expect(() => positional.layout.reorder("0", "2", "after")).toThrow(/identities/); expect(positional.acceptReorder).not.toHaveBeenCalled();
  });
  it("moves a merged block past its neighbor from either an anchor or covered row", () => {
    const { layout, getRows } = fixture({ layout: { spans: [merge] } });
    layout.moveRow("0", 1); expect(getRows().map((row) => row.id)).toEqual(["2", "0", "1", "3", "4"]);
    layout.moveRow("1", -1); expect(getRows().map((row) => row.id)).toEqual(["0", "1", "2", "3", "4"]);
    layout.moveRow("0", -1); expect(getRows().map((row) => row.id)).toEqual(["0", "1", "2", "3", "4"]);
  });
  it("moves past the complete neighboring merged block without splitting it", () => {
    const { layout, getRows } = fixture({ layout: { spans: [{ rowIds: ["1", "2"], columnIds: ["name"] }] } });
    layout.moveRow("0", 1); expect(getRows().map((row) => row.id)).toEqual(["1", "2", "0", "3", "4"]);
    layout.moveRow("0", -1); expect(getRows().map((row) => row.id)).toEqual(["0", "1", "2", "3", "4"]);
  });
  it("rejects off-page imperative reorder before it can split an inactive merge", () => {
    const { layout, grid, acceptReorder, getRows } = fixture({ count: 6, grid: { initialState: { pagination: { pageIndex: 0, pageSize: 2 } } }, layout: { spans: [{ rowIds: ["2", "3"], columnIds: ["name"] }] } });
    expect(() => layout.reorder("5", "3", "before")).toThrow(/current layout page/); expect(acceptReorder).not.toHaveBeenCalled();
    expect(getRows().map((row) => row.id)).toEqual(["0", "1", "2", "3", "4", "5"]);
    grid.setPageIndex(1); expect(layout.getView({ scrollTop: 0, height: 440 }).center.map((item) => item.row.id)).toEqual(["2", "3"]);
    expect(layout.getCellSpan("3", "name")?.anchor).toEqual(cell("2"));
  });
  it("preserves a new editor opened while imperative editing updates focus", () => {
    const { layout, grid } = fixture(); let entered = false;
    grid.setOptions((options) => ({ ...options, onStateChange: () => { if (!entered) { entered = true; layout.beginEdit(cell("2")); } } }));
    layout.beginEdit(cell("1")); expect(layout.getState().editing?.coordinate).toEqual(cell("2")); expect(grid.getState().focusedCell).toEqual(cell("2"));
  });
  it("does not clear cut cells when the clipboard callback changes drafts or selection", () => {
    const { layout, editor } = fixture(); layout.select(cell("0"));
    expect(layout.cut(() => editor.setValue("0", "name", "new input"))).toMatchObject({ blocked: true, committed: 0 });
    expect(editor.getValue("0", "name")).toBe("new input");
    expect(layout.cut(() => layout.select(cell("1")))).toMatchObject({ blocked: true, committed: 0 });
    expect(editor.getValue("1", "name")).toBe("Row 1");
  });
  it("rejects mixed snapshots if clipboard or export formatters change drafts", () => {
    const { layout, grid, editor } = fixture(); let mutate: (() => void) | undefined;
    grid.setOptions((options) => ({ ...options, columns: [{ accessorKey: "name", enableEditing: true,
      clipboardValue: () => { mutate?.(); return "formatted"; }, exportValue: () => { mutate?.(); return "formatted"; } }, { accessorKey: "amount" }] }));
    layout.select(cell("0")); mutate = () => editor.setValue("0", "name", "new copy");
    expect(() => layout.copy()).toThrow(/changed/); expect(editor.getValue("0", "name")).toBe("new copy");
    mutate = () => editor.setValue("0", "name", "new export"); expect(() => layout.getExportSnapshot()).toThrow(/changed/);
    expect(editor.getValue("0", "name")).toBe("new export");
  });
  it("rejects silent schema changes from copy and export formatters", () => {
    const { layout, grid } = fixture();
    const makeSensitive = () => { grid.setOptions((options) => ({ ...options, columns: [{ accessorKey: "name" }, { accessorKey: "amount", meta: { sensitive: true } }] }), { notify: false }); return "formatted"; };
    const changePolicy = () => grid.setOptions((options) => ({ ...options, columns: [{ accessorKey: "name", clipboardValue: makeSensitive, exportValue: makeSensitive }, { accessorKey: "amount" }] }));
    changePolicy(); layout.select(cell("0"), cell("0", "amount")); expect(() => layout.copy()).toThrow(/changed/);
    changePolicy(); expect(() => layout.getExportSnapshot()).toThrow(/changed/);
    expect(layout.getExportSnapshot().columnIds).toEqual(["name"]);
  });
  it("releases subscriptions and cached rows on idempotent disposal", () => {
    const { layout, grid, editor } = fixture(), listener = vi.fn(); layout.subscribe(listener); layout.dispose(); layout.dispose(); listener.mockClear(); grid.setGlobalFilter("Row"); editor.setValue("0", "name", "other");
    expect(listener).not.toHaveBeenCalled(); expect(layout.getState().ranges).toEqual([]); expect(() => layout.getView({ scrollTop: 0, height: 400 })).toThrow(/disposed/);
  });
  it("cleans the grid subscription if a disposed editor rejects constructor subscription", () => {
    const { layout, editor, grid } = fixture(); layout.dispose(); editor.dispose();
    let active = 0; const subscribe = grid.subscribe;
    vi.spyOn(grid, "subscribe").mockImplementation((listener) => { const stop = subscribe(listener); active++; return () => { stop(); active--; }; });
    expect(() => createGridLayoutController(grid, { editing: editor })).toThrow(/disposed/); expect(active).toBe(0);
  });
  it("uses physical RTL column order with stable physical pinned edges and logical Home/End", () => {
    const { layout, grid } = fixture({ layout: { direction: "rtl" }, grid: { columns: [
      { accessorKey: "name", size: 80 }, { accessorKey: "amount", size: 80 }, { accessorKey: "id", size: 80 }, { id: "extra", accessorFn: (row) => row.name, size: 80 },
    ] } });
    grid.pinColumn("name", "left"); grid.pinColumn("extra", "right"); const view = layout.getView({ scrollTop: 0, height: 400 });
    expect(view.direction).toBe("rtl"); expect(view.columns.map((column) => column.id)).toEqual(["name", "id", "amount", "extra"]);
    expect(view.columnLayout[0]).toMatchObject({ pinned: "left", pinnedStart: 0 }); expect(view.columnLayout[3]).toMatchObject({ pinned: "right", pinnedStart: 0 });
    layout.focus(cell("0", "amount")); layout.moveFocus("left"); expect(layout.getState().focusedCell).toEqual(cell("0", "id"));
    layout.moveFocus("home"); expect(layout.getState().focusedCell).toEqual(cell("0", "extra")); layout.moveFocus("end"); expect(layout.getState().focusedCell).toEqual(cell("0", "name"));
  });
  it("batches measurements in one notification and keeps async operation revisions stable for measurement only", () => {
    const { layout, editor } = fixture(), view = layout.getView({ scrollTop: 0, height: 440 }), listener = vi.fn(); layout.subscribe(listener);
    const before = layout.getState(); layout.measureMany([{ key: view.center[0]!.key, height: 100 }, { key: view.center[1]!.key, height: 80 }]);
    expect(listener).toHaveBeenCalledTimes(1); expect(layout.getScrollOffset("2")).toBe(180); expect(layout.getState().operationRevision).toBe(before.operationRevision);
    expect(layout.getView({ scrollTop: 0, height: 440 }).center[0]).toMatchObject({ height: 100, estimatedHeight: 44 });
    layout.measure(view.center[0]!.key, 44); expect(layout.getScrollOffset("2")).toBe(124); expect(layout.getState().draftRevision).toBe(before.draftRevision);
    editor.setValue("0", "name", "changed"); expect(layout.getState().draftRevision).toBeGreaterThan(before.draftRevision); expect(layout.getState().operationRevision).toBeGreaterThan(before.operationRevision);
  });
  it("exports an immutable typed layout snapshot with matching merges and no presentation detail rows", () => {
    const { layout, editor } = fixture({ layout: { spans: [merge] } }); layout.toggleDetail("3"); editor.setValue("0", "amount", 12);
    const snapshot = layout.getExportSnapshot(); expect(snapshot.rowIds).toEqual(["0", "1", "2", "3", "4"]); expect(snapshot.values[0]).toEqual(["Row 0", 12]);
    expect(snapshot.values[1]?.[0]).toBeNull(); expect(snapshot.spans).toEqual([{ start: cell("0"), rowSpan: 2, columnSpan: 1 }]); expect(Object.isFrozen(snapshot.values[0])).toBe(true);
    editor.setValue("0", "amount", 15); expect(snapshot.values[0]?.[1]).toBe(12);
  });
  it("does not include unselected Cartesian cells when exporting multiple disjoint ranges", () => {
    const { layout } = fixture(); layout.select(cell("0")); layout.select(cell("3", "amount"), cell("3", "amount"), true);
    expect(() => layout.getExportSnapshot({ scope: "range" })).toThrow(/explicit range/);
    const chosen = layout.getExportSnapshot({ scope: "range", rangeIndex: 1 }); expect(chosen.rowIds).toEqual(["3"]); expect(chosen.columnIds).toEqual(["amount"]); expect(chosen.values).toEqual([[3]]);
  });
  it("revalidates sensitive/exportable projections and refuses a partially exported merge", () => {
    const hidden = fixture({ grid: { columns: [{ accessorKey: "name", meta: { sensitive: true } }, { accessorKey: "amount" }] } });
    expect(hidden.layout.getExportSnapshot().columnIds).toEqual(["amount"]); expect(() => hidden.layout.getExportSnapshot({ columnIds: ["name"] })).toThrow(/forbidden/);
    const merged = fixture({ layout: { spans: [{ rowIds: ["0"], columnIds: ["name", "amount"] }] } }); expect(() => merged.layout.getExportSnapshot({ columnIds: ["amount"] })).toThrow(/split/);
    expect(() => merged.layout.getExportSnapshot({ maxCells: 1 })).toThrow(/limit/);
  });
});
describe("strict bounded clipboard transport", () => {
  it("roundtrips quotes, empty cells and embedded line breaks", () => {
    const values = [["", "a\tb", 'quoted "value"', "한글\r\nnext"], ["one", "", "three", "four"]];
    expect(parseLayoutClipboardText(layoutClipboardText([{ values }], false)).values).toEqual(values);
    expect(parseLayoutClipboardText("a\t\r\nb\tc\r\n").values).toEqual([["a", ""], ["b", "c"]]);
  });
  it("protects formula-like text and rejects malformed/versioned/oversized clipboard data", () => {
    expect(layoutClipboardText([{ values: [["=SUM(A1)", "+1", "@name"]] }])).toBe("'=SUM(A1)\t'+1\t'@name");
    expect(() => parseLayoutClipboardText('"unfinished')).toThrow(/Unterminated/); expect(() => parseLayoutClipboardText('"done"extra')).toThrow(/closing/);
    expect(() => parseLayoutClipboardPayload('{"version":2,"blocks":[]}')).toThrow(); expect(() => parseLayoutClipboardPayload('{"version":1,"blocks":[{"values":[["a"],["b","c"]]}]}')).toThrow();
    expect(() => parseLayoutClipboardText("x".repeat(1_000_001))).toThrow(/large/);
    expect(() => parseLayoutClipboardText("\t".repeat(100) + "\n" + "x\n".repeat(100))).toThrow(/padded cell limit/);
  });
});
