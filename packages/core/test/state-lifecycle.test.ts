import { describe, expect, it, vi } from "vitest";
import { createGrid, type GridState } from "../src";

interface Item { id: string; name: string; }
const data: Item[] = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
const columns = [{ accessorKey: "name" as const, enableEditing: true }];
const cell = (rowId = "a") => ({ rowId, columnId: "name" });
const makeGrid = () => createGrid<Item>({ data, columns, getRowId: (row) => row.id, editHistoryLimit: 5 });

describe("data/schema reconciliation", () => {
  it("does not start an editor for a row deleted inside the start callback", () => {
    const grid = makeGrid();
    grid.setOptions((previous) => ({ ...previous, onCellEdit: (event) => {
      if (event.phase === "start") grid.setOptions((options) => ({ ...options, data: [] }));
    } }));
    expect(grid.startCellEdit("a", "name")?.defaultPrevented).toBe(true);
    expect(grid.getState().editingCell).toBeNull();
  });

  it.each(["commit", "cancel"] as const)("does not close an editor opened by a %s callback", (phase) => {
    const grid = makeGrid();
    grid.startCellEdit("a", "name");
    grid.setOptions((previous) => ({ ...previous, onCellEdit: (event) => {
      if (event.phase === phase) grid.startCellEdit("b", "name");
    } }));
    if (phase === "commit") grid.commitCellEdit("new"); else grid.cancelCellEdit();
    expect(grid.getState().editingCell).toEqual(cell("b"));
  });

  it("notifies history subscribers after a commit opens another editor", () => {
    const grid = makeGrid(), depths: number[] = [];
    grid.startCellEdit("a", "name");
    grid.subscribeSelector((current) => current.getCellEditHistoryState().undoDepth, (depth) => depths.push(depth));
    grid.setOptions((previous) => ({ ...previous, onCellEdit: (event) => {
      if (event.phase === "commit") grid.startCellEdit("b", "name");
    } }));
    grid.commitCellEdit("new");
    expect(depths).toEqual([1]);
  });

  it("history replay preserves a newer editor created by the callback", () => {
    const grid = makeGrid();
    grid.startCellEdit("a", "name"); grid.commitCellEdit("new");
    grid.setOptions((previous) => ({ ...previous, data: [{ id: "a", name: "new" }, data[1]!], onCellEdit: (event) => {
      if (event.historyAction) grid.startCellEdit("b", "name");
    } }));
    grid.undoCellEdit();
    expect(grid.getState().editingCell).toEqual(cell("b"));
    expect(grid.getState().focusedCell).toEqual(cell("b"));
  });

  it("clears removed cell coordinates but retains product-owned selection", () => {
    const grid = makeGrid();
    grid.setFocusedCell(cell()); grid.startCellEdit("a", "name"); grid.selectCellRange(cell(), cell("b"));
    grid.setFocusedCell(cell());
    grid.toggleRowSelected("a");
    grid.setOptions((previous) => ({ ...previous, data: data.slice(1) }));
    expect(grid.getState()).toMatchObject({ focusedCell: null, editingCell: null, cellSelectionRange: null, rowSelection: { a: true } });
    grid.pruneRowSelection();
    expect(grid.getState().rowSelection).toEqual({});
  });

  it("preserves a surviving editor during value updates and reorder", () => {
    const grid = makeGrid();
    grid.setFocusedCell(cell()); grid.startCellEdit("a", "name");
    grid.setOptions((previous) => ({ ...previous, data: [{ id: "b", name: "B" }, { id: "a", name: "new server value" }] }));
    expect(grid.getState()).toMatchObject({ focusedCell: cell(), editingCell: cell() });
    expect(grid.getCoreRowModel().rowsById.a?.getValue("name")).toBe("new server value");
  });

  it("clears coordinates for removed columns without emitting a fake cancel", () => {
    const grid = makeGrid(), onCellEdit = vi.fn();
    grid.setOptions((previous) => ({ ...previous, onCellEdit }));
    grid.setFocusedCell(cell()); grid.startCellEdit("a", "name"); grid.selectCellRange(cell());
    onCellEdit.mockClear();
    grid.setOptions((previous) => ({ ...previous, columns: [{ accessorKey: "id" }] }));
    expect(grid.getState()).toMatchObject({ focusedCell: null, editingCell: null, cellSelectionRange: null });
    expect(onCellEdit).not.toHaveBeenCalled();
  });

  it("retains off-page and compact-all selection on server page replacement", () => {
    const grid = makeGrid();
    grid.setOptions((previous) => ({ ...previous, manualPagination: true }));
    grid.toggleAllRowsSelected(true); grid.toggleRowSelected("a", false);
    grid.setFocusedCell(cell()); grid.startCellEdit("a", "name");
    grid.setOptions((previous) => ({ ...previous, data: [{ id: "c", name: "C" }] }));
    expect(grid.getState()).toMatchObject({ focusedCell: null, editingCell: null, allRowsSelected: true, rowSelection: { a: false } });
    expect(grid.getIsRowSelected("c")).toBe(true);
  });

  it("proposes cleanup to controlled state and lets the owner accept it", () => {
    const onStateChange = vi.fn<(state: GridState) => void>();
    const grid = createGrid<Item>({ data, columns, getRowId: (row) => row.id,
      state: { focusedCell: cell() }, onStateChange });
    grid.setOptions((previous) => ({ ...previous, data: [] }));
    expect(onStateChange).toHaveBeenCalledTimes(1);
    const proposal = onStateChange.mock.calls[0]![0];
    expect(proposal.focusedCell).toBeNull();
    expect(grid.getState().focusedCell).toEqual(cell());
    grid.setOptions((previous) => ({ ...previous, state: { focusedCell: proposal.focusedCell } }));
    expect(grid.getState().focusedCell).toBeNull();
  });

  it("defers silent option-change callbacks until reconciliation and uses the latest state", () => {
    const grid = makeGrid(), onStateChange = vi.fn(), listener = vi.fn();
    grid.setFocusedCell(cell());
    grid.setOptions((previous) => ({ ...previous, onStateChange }));
    grid.subscribe(listener);
    grid.setOptions((previous) => ({ ...previous, data: [] }), { notify: false });
    expect(grid.getState().focusedCell).toBeNull();
    expect(onStateChange).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled();
    grid.setState((previous) => ({ ...previous, globalFilter: "newer" }));
    onStateChange.mockClear(); listener.mockClear();
    grid.reconcileState();
    expect(grid.getState().globalFilter).toBe("newer");
    expect(onStateChange).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled();
  });

  it("flushes a silent cleanup exactly once after render", () => {
    const grid = makeGrid(), onStateChange = vi.fn();
    grid.setFocusedCell(cell());
    grid.setOptions((previous) => ({ ...previous, onStateChange }));
    grid.setOptions((previous) => ({ ...previous, data: [] }), { notify: false });
    expect(grid.reconcileState().focusedCell).toBeNull();
    grid.reconcileState();
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it("rolls back an invalid replacement when active coordinates require validation", () => {
    const grid = makeGrid();
    grid.setFocusedCell(cell());
    const oldOptions = grid.getOptions(), oldState = grid.getState();
    expect(() => grid.setOptions((previous) => ({ ...previous, data: [data[0]!, data[0]!] }))).toThrow(TypeError);
    expect(grid.getOptions()).toBe(oldOptions); expect(grid.getState()).toBe(oldState);
    expect(grid.getCoreRowModel().rows.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("does not force lazy row index allocation for coordinate reconciliation", () => {
    const grid = makeGrid(), model = grid.getCoreRowModel();
    const readIndex = vi.fn(() => { throw new Error("index should remain lazy"); });
    Object.defineProperty(model, "rowsById", { get: readIndex });
    grid.setFocusedCell(cell());
    grid.setOptions((previous) => ({ ...previous }));
    expect(grid.reconcileState().focusedCell).toEqual(cell());
    expect(readIndex).not.toHaveBeenCalled();
  });
});

describe("subscription lifecycle", () => {
  it("does not call new or unsubscribed listeners in the current snapshot", () => {
    const grid = makeGrid(), late = vi.fn(), removed = vi.fn();
    let unsubscribe = () => {};
    grid.subscribe(() => { unsubscribe(); grid.subscribe(late); });
    unsubscribe = grid.subscribe(removed);
    grid.setGlobalFilter("one");
    expect(removed).not.toHaveBeenCalled(); expect(late).not.toHaveBeenCalled();
    grid.setGlobalFilter("two");
    expect(late).toHaveBeenCalledTimes(1);
    unsubscribe(); unsubscribe();
  });

  it("queues reentrant notifications instead of recursively calling a listener", () => {
    const grid = makeGrid(); let depth = 0, maxDepth = 0;
    const values: string[] = [];
    grid.subscribe(() => {
      depth += 1; maxDepth = Math.max(maxDepth, depth);
      if (grid.getState().globalFilter === "one") grid.setGlobalFilter("two");
      values.push(grid.getState().globalFilter); depth -= 1;
    });
    grid.setGlobalFilter("one");
    expect(maxDepth).toBe(1); expect(values).toEqual(["two", "two"]);
  });

  it("notifies remaining subscribers before rethrowing callback failures", () => {
    const grid = makeGrid(), next = vi.fn(), failure = new Error("listener failed");
    grid.subscribe(() => { throw failure; }); grid.subscribe(next);
    expect(() => grid.setGlobalFilter("one")).toThrow(failure);
    expect(next).toHaveBeenCalledTimes(1);
    expect(grid.getState().globalFilter).toBe("one");
  });

  it("publishes accepted state even when onStateChange throws", () => {
    const grid = makeGrid(), next = vi.fn(), failure = new Error("owner failed");
    grid.setOptions((previous) => ({ ...previous, onStateChange: () => { throw failure; } }));
    grid.subscribe(next);
    expect(() => grid.setGlobalFilter("one")).toThrow(failure);
    expect(next).toHaveBeenCalledTimes(1); expect(grid.getState().globalFilter).toBe("one");
  });

  it("collects multiple listener failures and remains usable after unsubscribe", () => {
    const grid = makeGrid(), first = new Error("first"), second = new Error("second"), next = vi.fn();
    const stopFirst = grid.subscribe(() => { throw first; });
    const stopSecond = grid.subscribe(() => { throw second; });
    grid.subscribe(next);
    try { grid.setGlobalFilter("one"); throw new Error("expected failure"); }
    catch (error) { expect(error).toBeInstanceOf(AggregateError); expect((error as AggregateError).errors).toEqual([first, second]); }
    expect(next).toHaveBeenCalledTimes(1);
    stopFirst(); stopSecond();
    grid.setGlobalFilter("two");
    expect(next).toHaveBeenCalledTimes(2);
  });
});
