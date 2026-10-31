import { afterEach, describe, expect, it, vi } from "vitest";
import { createGrid, type CellCoordinate } from "@rowick/core";
import { createGridLayoutController } from "../src/layout-controller";
import { createRowEditingController } from "../src/row-editing";
import { createLayoutClipboardContent, createLayoutInteractions, getIsLayoutComposing, getLayoutCellId, getLayoutCellStyle, getLayoutHTMLPayload, getLayoutNavigation, type LayoutClipboardContent, type LayoutTransferLike } from "../src/layout-ui";
import { LAYOUT_CLIPBOARD_MIME } from "../src/layout-clipboard";
const cleanup: Array<() => void> = []; afterEach(() => { for (const stop of cleanup.splice(0)) stop(); });
interface Item { id: string; name: string; amount: number | null; }
const coordinate = (rowId = "a", columnId = "name"): CellCoordinate => ({ rowId, columnId });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function fixture(options: { readOnly?: boolean } = {}) {
  let rows: readonly Item[] = [{ id: "a", name: "Alpha", amount: 1 }, { id: "b", name: "Beta", amount: 2 }, { id: "c", name: "Gamma", amount: 3 }];
  const grid = createGrid<Item>({ data: rows, getRowId: (row) => row.id, columns: [{ accessorKey: "name", enableEditing: true }, { accessorKey: "amount", enableEditing: true, editValueParser: (raw) => raw === "" ? null : Number(raw), validateEditValue: (value) => value === null || typeof value === "number" && Number.isFinite(value) || "Invalid number" }] });
  const editor = createRowEditingController<Item>({ getRow: (id) => rows.find((row) => row.id === id), getRowId: (row) => row.id, getValue: (row, column) => row[column as keyof Item], applyValues: (row, values) => ({ ...row, ...values }), canEdit: (id) => !(options.readOnly && id === "b"), accept: (id, item) => { rows = rows.map((row) => row.id === id ? item : row); grid.setOptions((previous) => ({ ...previous, data: rows })); } });
  const layout = createGridLayoutController(grid, { editing: editor, acceptReorder: (data) => { rows = data; grid.setOptions((previous) => ({ ...previous, data: rows })); } });
  const report = vi.fn(), reveal = vi.fn(), writeClipboard = vi.fn(async (_copy: LayoutClipboardContent) => {}), readClipboard = vi.fn(async () => ({ text: "Pasted" }));
  const interactions = createLayoutInteractions(layout, { report, reveal, writeClipboard, readClipboard }); cleanup.push(() => { interactions.dispose(); layout.dispose(); editor.dispose(); });
  return { grid, editor, layout, interactions, report, reveal, writeClipboard, readClipboard };
}
function transfer(initial: Record<string, string> = {}, denied?: string): LayoutTransferLike {
  const values = new Map(Object.entries(initial)); return { get types() { return [...values.keys()]; }, getData: (type) => values.get(type) ?? "", setData: (type, value) => { if (type === denied) throw new Error("Clipboard denied"); values.set(type, value); } };
}
const event = (clipboardData: LayoutTransferLike) => ({ clipboardData, preventDefault: vi.fn() });

describe("layout UI metadata and keyboard", () => {
  it("produces collision-free IDs for opaque row and column names", () => {
    expect(getLayoutCellId("one", coordinate("a-b", "c"))).not.toBe(getLayoutCellId("one", coordinate("a", "b-c")));
    expect(getLayoutCellId("one", coordinate("__proto__", "toString"))).toContain("%22__proto__%22");
  });
  it("uses the last covered pinned-right offset for a merged cell", () => {
    const { grid, layout } = fixture(); grid.pinColumn("name", "right"); grid.pinColumn("amount", "right");
    const view = layout.getView({ scrollTop: 0, height: 300 }); expect(getLayoutCellStyle(view, 0, 2)).toMatchObject({ position: "sticky", right: 0, width: view.columns.reduce((total, column) => total + column.getSize(), 0) });
  });
  it.each([{ isComposing: true }, { keyCode: 229 }, { nativeEvent: { isComposing: true } }])("keeps composition away from navigation %#", (flags) => {
    expect(getIsLayoutComposing({ key: "Enter", ...flags })).toBe(true); expect(getLayoutNavigation({ key: "ArrowLeft", ...flags })).toBeNull();
  });
  it("maps physical arrows without an extra RTL reversal and retains logical home/end commands", () => {
    expect(getLayoutNavigation({ key: "ArrowLeft" })).toBe("left"); expect(getLayoutNavigation({ key: "Home", ctrlKey: true })).toBe("grid-start"); expect(getLayoutNavigation({ key: "End" })).toBe("end");
  });
  it("does not intercept interactive detail input or composition shortcuts", () => {
    const { interactions, layout } = fixture(); layout.focus(coordinate()); const preventDefault = vi.fn();
    interactions.key({ key: "ArrowDown", target: { closest: () => ({}) }, preventDefault }); interactions.key({ key: "ArrowDown", isComposing: true, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled(); expect(layout.getState().focusedCell).toEqual(coordinate());
  });
  it("preserves native mouse compatibility events while extending pointer ranges", () => {
    const { interactions, layout } = fixture(), preventDefault = vi.fn(); interactions.pointerStart(coordinate(), { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, pointerType: "mouse", preventDefault });
    expect(preventDefault).not.toHaveBeenCalled(); interactions.pointerEnter(coordinate("b"), 1); expect(layout.getState().focusedCell).toEqual(coordinate("b")); interactions.pointerEnd(); interactions.pointerEnter(coordinate("c"), 1); expect(layout.getState().focusedCell).toEqual(coordinate("b"));
  });
  it("preserves touch panning and blocks partial composition commits or stale input events", () => {
    const { interactions, layout } = fixture(), preventDefault = vi.fn(); interactions.pointerStart(coordinate(), { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, pointerType: "touch", preventDefault });
    expect(preventDefault).not.toHaveBeenCalled(); interactions.pointerEnter(coordinate("b"), 1); expect(layout.getState().focusedCell).toEqual(coordinate());
    interactions.startEdit(coordinate()); const token = layout.getState().editing!.token; interactions.setComposing(token, true); interactions.setEditInput(token, "ㅎ"); interactions.editorKey({ key: "Enter", preventDefault, stopPropagation() {} }, token); expect(layout.getState().editing?.value).toBe("ㅎ");
    interactions.focus(coordinate("b")); expect(layout.getState().editing?.token).toBe(token); interactions.setComposing(token, false); interactions.setEditInput(token, "한글"); interactions.editorKey({ key: "Enter", preventDefault, stopPropagation() {} }, token); expect(layout.getCellValue("a", "name")).toBe("한글");
    interactions.startEdit(coordinate("b")); interactions.setEditInput(token, "stale"); expect(layout.getState().editing?.value).toBe("Beta");
  });
  it("commits a valid editor before moving cells and preserves invalid raw input", () => {
    const { layout, interactions, reveal } = fixture(); layout.focus(coordinate("a", "amount")); interactions.startEdit(coordinate("a", "amount")); layout.setEditInput("invalid");
    interactions.focus(coordinate("b")); expect(layout.getState().editing).toMatchObject({ coordinate: coordinate("a", "amount"), value: "invalid", error: "Invalid number" }); expect(reveal).toHaveBeenLastCalledWith(coordinate("a", "amount"), expect.any(Number));
    layout.setEditInput("8"); interactions.focus(coordinate("b")); expect(layout.getState().editing).toBeNull(); expect(layout.getCellValue("a", "amount")).toBe(8); expect(layout.getState().focusedCell).toEqual(coordinate("b"));
  });
  it("ignores an expired editor's Escape and preserves a newly opened session on commit", () => {
    const { layout, interactions, editor, reveal } = fixture(); layout.beginEdit(coordinate()); const old = layout.getState().editing!.token; layout.cancelEdit(); layout.beginEdit(coordinate("b")); const current = layout.getState().editing!.token;
    interactions.editorKey({ key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() }, old); expect(layout.getState().editing?.token).toBe(current);
    let opened = false; const stop = editor.subscribe(() => { if (!opened) { opened = true; layout.beginEdit(coordinate("c")); } }); layout.setEditInput("new"); reveal.mockClear(); interactions.editorKey({ key: "Enter", preventDefault: vi.fn(), stopPropagation: vi.fn() }, current); stop();
    expect(layout.getState().editing?.coordinate).toEqual(coordinate("c")); expect(reveal).not.toHaveBeenCalled();
  });
});

describe("layout clipboard UI and delayed operations", () => {
  it("retains raw values in MIME/HTML metadata while escaping visible spreadsheet formulas and HTML", () => {
    const payload = JSON.stringify({ version: 1, blocks: [{ values: [["=SUM(1,2)", '<img src="x">', "한글\nsecond"]] }] });
    const content = createLayoutClipboardContent({ payload, text: "safe text" }); expect(content.html).toContain("'="); expect(content.html).toContain("&lt;img"); expect(content.html).not.toContain('<img src="x">'); expect(getLayoutHTMLPayload(content.html)).toBe(payload);
    expect(getLayoutHTMLPayload("<p>Unrelated HTML</p>")).toBeUndefined(); expect(() => getLayoutHTMLPayload('data-rowick-ranges="%zz"')).toThrow();
  });
  it("rejects its own oversized percent-encoded HTML before writing or clearing cells", () => {
    const payload = JSON.stringify({ version: 1, blocks: [{ values: [["한".repeat(450_000)]] }] }); expect(payload.length).toBeLessThan(1_000_000);
    expect(() => createLayoutClipboardContent({ payload, text: "selection" })).toThrow(/HTML is too large/);
  });
  it("uses custom MIME before text and preserves multi-range blocks through HTML fallback", () => {
    const { layout, interactions } = fixture(); layout.select(coordinate()); layout.select(coordinate("c"), coordinate("c"), true); const clip = transfer({}, LAYOUT_CLIPBOARD_MIME); interactions.copy(event(clip)); expect(clip.types).not.toContain(LAYOUT_CLIPBOARD_MIME); expect(clip.types).toContain("text/html");
    layout.select(coordinate("a", "amount")); layout.select(coordinate("c", "amount"), coordinate("c", "amount"), true);
    // A typed numeric destination rejects names; use text destinations for the actual copy.
    layout.select(coordinate("b")); layout.select(coordinate("c"), coordinate("c"), true); interactions.paste(event(clip)); expect(layout.getCellValue("b", "name")).toBe("Alpha"); expect(layout.getCellValue("c", "name")).toBe("Gamma");
    const preferred = transfer({ "text/plain": "Wrong", [LAYOUT_CLIPBOARD_MIME]: JSON.stringify({ version: 1, blocks: [{ values: [["Preferred"]] }] }) }); layout.select(coordinate()); interactions.paste(event(preferred)); expect(layout.getCellValue("a", "name")).toBe("Preferred");
  });
  it("does not clear cells if the clipboard write fails or cut contains a read-only cell", () => {
    const { layout, interactions } = fixture(); layout.select(coordinate()); interactions.copy(event(transfer({}, "text/html")), true); expect(layout.getCellValue("a", "name")).toBe("Alpha");
    const denied = fixture({ readOnly: true }); denied.layout.select(coordinate(), coordinate("b")); denied.interactions.copy(event(transfer()), true); expect(denied.layout.getCellValue("a", "name")).toBe("Alpha");
    interactions.copy(event(transfer()), true); expect(layout.getCellValue("a", "name")).toBe(""); expect(layout.undo()).toBe(true); expect(layout.getCellValue("a", "name")).toBe("Alpha");
  });
  it("rejects malformed custom metadata without falling through to a valid plain-text paste", () => {
    const { layout, interactions, report } = fixture(); layout.select(coordinate()); interactions.paste(event(transfer({ "text/plain": "Unexpected", [LAYOUT_CLIPBOARD_MIME]: "" }))); expect(layout.getCellValue("a", "name")).toBe("Alpha"); expect(report).toHaveBeenLastCalledWith(expect.stringContaining("Empty clipboard"), true);
  });
  it("allows harmless measurement updates while a clipboard cut is awaiting confirmation", async () => {
    const { layout, interactions, writeClipboard } = fixture(), wait = deferred<void>(); writeClipboard.mockImplementation(() => wait.promise); layout.select(coordinate()); const pending = interactions.copyClipboard(true);
    const before = layout.getState(), view = layout.getView({ scrollTop: 0, height: 300 }); layout.measureMany([{ key: view.center[0]!.key, height: 80 }]); expect(layout.getState().operationRevision).toBe(before.operationRevision); wait.resolve(); await pending; expect(layout.getCellValue("a", "name")).toBe("");
  });
  it("fences selection and draft changes while async clipboard read/write is pending", async () => {
    const { layout, interactions, writeClipboard, report } = fixture(), write = deferred<void>(); layout.select(coordinate()); writeClipboard.mockImplementation(() => write.promise); const cut = interactions.copyClipboard(true); layout.select(coordinate("b")); write.resolve(); await cut; expect(layout.getCellValue("a", "name")).toBe("Alpha"); expect(report).toHaveBeenLastCalledWith(expect.stringContaining("not cleared"), true);
    const next = fixture(), read = deferred<{ text: string }>(); next.layout.select(coordinate()); next.readClipboard.mockImplementation(() => read.promise); const paste = next.interactions.pasteClipboard(); next.editor.setValue("b", "name", "New draft"); read.resolve({ text: "Pasted" }); await paste; expect(next.layout.getCellValue("a", "name")).toBe("Alpha"); expect(next.layout.getCellValue("b", "name")).toBe("New draft");
  });
  it("does not apply an async clipboard response or notify after disposal", async () => {
    const { layout, interactions, readClipboard, report } = fixture(), wait = deferred<{ text: string }>(); layout.select(coordinate()); readClipboard.mockImplementation(() => wait.promise); const pending = interactions.pasteClipboard(); interactions.dispose(); report.mockClear(); wait.resolve({ text: "Late" }); await pending; expect(layout.getCellValue("a", "name")).toBe("Alpha"); expect(report).not.toHaveBeenCalled();
  });
});
