import { describe, expect, it, vi } from "vitest";
import { createGrid, type GridOptions } from "@rowick/core";
import { prepareRowTransaction, commitRowTransaction } from "../src";

interface Item { id: string; value: number; children?: Item[]; }
const row = (id: string, value = 1, children?: Item[]): Item => ({ id, value, ...(children ? { children } : {}) });
const data = [row("a"), row("b", 2)];
const columns = [{ accessorKey: "value" as const, enableEditing: true }];
const makeGrid = (rows: Item[] = data) => createGrid<Item>({ data: rows, columns, getRowId: (row) => row.id, getSubRows: (row) => row.children });
const treeOptions = { setSubRows: (original: Item, children: readonly Item[]): Item => ({ ...original, children: [...children] }) };

describe("immutable row transactions", () => {
  it("prepares an atomic combined add/update/remove proposal without notifying", () => {
    const grid = makeGrid(), onStateChange = vi.fn(), listener = vi.fn();
    grid.setOptions((previous) => ({ ...previous, onStateChange }));
    grid.subscribe(listener);
    const proposal = prepareRowTransaction(grid, { add: [{ data: row("c"), index: 0 }], update: [{ id: "b", data: row("b", 3) }], remove: ["a"] });
    expect(proposal.data.map((item) => [item.id, item.value])).toEqual([["c", 1], ["b", 3]]);
    expect(proposal).toMatchObject({ addedIds: ["c"], updatedIds: ["b"], removedIds: ["a"], changed: true });
    expect(grid.getOptions().data).toBe(data);
    expect(listener).not.toHaveBeenCalled(); expect(onStateChange).not.toHaveBeenCalled();
    commitRowTransaction(grid, proposal);
    expect(grid.getOptions().data).toBe(proposal.data);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(data.map((item) => [item.id, item.value])).toEqual([["a", 1], ["b", 2]]);
  });

  it("preserves row identity through sorting/filtering and clears removed coordinates", () => {
    const grid = makeGrid();
    grid.toggleRowSelected("b"); grid.setFocusedCell({ rowId: "a", columnId: "value" });
    grid.setSorting([{ id: "value", desc: true }]);
    const proposal = prepareRowTransaction(grid, { update: [{ id: "b", data: row("b", 5) }], remove: ["a"] });
    commitRowTransaction(grid, proposal);
    expect(grid.getRowModel().rows.map((item) => item.id)).toEqual(["b"]);
    expect(grid.getState().focusedCell).toBeNull();
    expect(grid.getSelectedRowModel().rows[0]?.getValue("value")).toBe(5);
  });

  it("keeps unmodified row references and returns the original array for no-op", () => {
    const grid = makeGrid(), listener = vi.fn(); grid.subscribe(listener);
    const noOp = prepareRowTransaction(grid, {});
    expect(noOp.changed).toBe(false); expect(noOp.data).toBe(data);
    commitRowTransaction(grid, noOp); expect(listener).not.toHaveBeenCalled();
    const proposal = prepareRowTransaction(grid, { add: [{ data: row("c") }] });
    expect(proposal.data[0]).toBe(data[0]); expect(proposal.data[1]).toBe(data[1]);
  });

  it("requires an explicit stable identity function", () => {
    const grid = createGrid({ data, columns });
    expect(() => prepareRowTransaction(grid, { add: [{ data: row("c") }] })).toThrow(/stable getRowId/);
  });

  it.each([
    { add: [{ data: row("a") }] },
    { update: [{ id: "a", data: row("b") }] },
    { update: [{ id: "missing", data: row("c") }] },
    { update: [{ id: "a", data: row("a") }, { id: "a", data: row("a") }] },
    { remove: ["a", "a"] }, { remove: ["missing"] },
    { update: [{ id: "a", data: row("a") }], remove: ["a"] },
    { remove: ["a"], add: [{ data: row("a", 9) }] },
    { add: [{ data: row("c"), index: -1 }] }, { add: [{ data: row("c"), index: 0.5 }] },
    { add: [{ data: row("c"), index: 4 }] }, { add: [{ data: row("__group__reserved") }] },
  ])("rejects invalid proposals without changing the source #%#", (transaction) => {
    const grid = makeGrid(), source = grid.getOptions();
    expect(() => prepareRowTransaction(grid, transaction)).toThrow(TypeError);
    expect(grid.getOptions()).toBe(source); expect(grid.getOptions().data).toBe(data);
  });

  it("rejects identity changes even when candidate IDs remain globally unique", () => {
    const grid = makeGrid();
    expect(() => prepareRowTransaction(grid, { update: [{ id: "a", data: row("new-id") }] })).toThrow(/preserve existing row identities/);
    const positional = createGrid({ data, columns, getRowId: (_row, index) => String(index) });
    expect(() => prepareRowTransaction(positional, { add: [{ data: row("c"), index: 0 }] })).toThrow(TypeError);
  });

  it("rewrites a tree immutably and reports removed descendants", () => {
    const original = [row("root", 1, [row("child", 2, [row("grandchild")]), row("other")])];
    const grid = makeGrid(original);
    const proposal = prepareRowTransaction(grid, { remove: ["child"], add: [{ data: row("added"), parentId: "root", index: 0 }],
      update: [{ id: "root", data: row("root", 9) }] }, treeOptions);
    expect(proposal.removedIds).toEqual(["child", "grandchild"]);
    expect(proposal.data[0]?.children?.map((item) => item.id)).toEqual(["added", "other"]);
    expect(proposal.data[0]?.value).toBe(9);
    expect(proposal.data[0]?.children?.[1]).toBe(original[0]?.children?.[1]);
    expect(original[0]?.children?.map((item) => item.id)).toEqual(["child", "other"]);
    commitRowTransaction(grid, proposal);
    expect(grid.getCoreRowModel().flatRows.map((item) => item.id)).toEqual(["root", "added", "other"]);
  });

  it("requires a child writer and checks its output before returning", () => {
    const grid = makeGrid([row("root", 1, [row("child")])]);
    const transaction = { remove: ["child"] };
    expect(() => prepareRowTransaction(grid, transaction)).toThrow(/require setSubRows/);
    expect(() => prepareRowTransaction(grid, transaction, { setSubRows: (row) => row })).toThrow(/inconsistent transaction child writer/);
    expect(grid.getCoreRowModel().flatRows).toHaveLength(2);
  });

  it.each([
    { remove: ["root", "child"] },
    { remove: ["root"], update: [{ id: "child", data: row("child", 3) }] },
    { remove: ["root"], add: [{ data: row("new"), parentId: "root" }] },
    { add: [{ data: row("new"), parentId: "missing" }] },
  ])("rejects removed ancestors and unknown parents #%#", (transaction) => {
    expect(() => prepareRowTransaction(makeGrid([row("root", 1, [row("child")])]), transaction, treeOptions)).toThrow(TypeError);
  });

  it("validates all IDs in newly added subtrees and rejects cycles", () => {
    const grid = makeGrid(), cyclic = row("cycle"); cyclic.children = [cyclic];
    expect(() => prepareRowTransaction(grid, { add: [{ data: row("root", 1, [row("b")]) }] })).toThrow(/duplicate row ID/);
    expect(() => prepareRowTransaction(grid, { add: [{ data: cyclic }] })).toThrow(/cyclic transaction subtree/);
    const proposal = prepareRowTransaction(grid, { add: [{ data: row("root", 1, [row("child")]) }] });
    expect(proposal.addedIds).toEqual(["root", "child"]);
  });

  it.each(["data", "columns", "getRowId", "getSubRows", "getRowCanExpand"] as const)("rejects stale %s before commit", (field) => {
    const grid = makeGrid(), proposal = prepareRowTransaction(grid, { add: [{ data: row("new") }] });
    const changed: Partial<GridOptions<Item>> = field === "data" ? { data: [...data] }
      : field === "columns" ? { columns: [...columns] }
      : field === "getRowId" ? { getRowId: (row) => row.id }
      : field === "getSubRows" ? { getSubRows: () => undefined }
      : { getRowCanExpand: () => false };
    grid.setOptions((previous) => ({ ...previous, ...changed }));
    const current = grid.getOptions();
    expect(() => commitRowTransaction(grid, proposal)).toThrow(/stale transaction source/);
    expect(grid.getOptions()).toBe(current);
  });
});
