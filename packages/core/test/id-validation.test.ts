import { describe, expect, it, vi } from "vitest";
import { createGrid, type AnyColumnDef } from "../src";

interface Item { id: string; value: string; other?: string; children?: Item[]; }
const columns: AnyColumnDef<Item>[] = [{ accessorKey: "value" }];
const item = (id: string, children?: Item[]): Item => ({ id, value: "private data", ...(children ? { children } : {}) });
const gridFor = (data: Item[]) => createGrid<Item>({ data, columns, getRowId: (row) => row.id, getSubRows: (row) => row.children });

describe("ID validation", () => {
  it("keeps distinct typed grouping keys and escapes the typed-key namespace", () => {
    const values = [1, "1", true, "true", null, "null", undefined, "undefined", NaN, Infinity,
      1n, "__value__number:1", new Date("2026-01-01T00:00:00Z"), "2026-01-01T00:00:00.000Z"];
    const grid = createGrid({ data: values.map((value, index) => ({ id: String(index), value })),
      columns: [{ accessorKey: "value" }], getRowId: (row) => row.id, initialState: { grouping: ["value"] } });
    const groups = grid.getGroupedRowModel();
    expect(groups.rows).toHaveLength(values.length);
    expect(new Set(groups.rows.map((row) => row.id)).size).toBe(values.length);
    for (const row of groups.flatRows) expect(groups.rowsById[row.id]).toBe(row);
  });

  it("rejects cyclic row data before recursion overflows, including positional IDs", () => {
    const cyclic = item("cycle"); cyclic.children = [cyclic];
    expect(() => gridFor([cyclic]).getCoreRowModel()).toThrow(/cyclic row hierarchy/);
    expect(() => createGrid<Item>({ data: [cyclic], columns, getSubRows: (row) => row.children }).getCoreRowModel()).toThrow(TypeError);
  });

  it.each(["", 0, 1, null, undefined, false, {}, Symbol("private")])("rejects invalid row ID #%#", (id) => {
    const grid = createGrid<Item>({ data: [item("ok")], columns, getRowId: () => id as string });
    expect(() => grid.getCoreRowModel()).toThrow(TypeError);
    expect(() => grid.getCoreRowModel()).toThrow(/row.*position 0.*non-empty string/);
  });

  it.each([
    [item("same"), item("same")],
    [item("same", [item("same")])],
    [item("p", [item("same")]), item("q", [item("same")])],
  ])("rejects duplicate IDs across the entire loaded tree #%#", (...data) => {
    expect(() => gridFor(data).getRowModel()).toThrow(/duplicate row ID.*positions \d+ and \d+/);
  });

  it.each(["__group__value:x", "__group__value:x>__footer__"])("reserves internal row namespace #%#", (id) => {
    expect(() => gridFor([item(id)]).getCoreRowModel()).toThrow(/reserved row ID.*position 0/);
  });

  it("does not disclose original rows, values, or IDs in errors", () => {
    try { gridFor([item("private-id"), item("private-id")]).getCoreRowModel(); throw new Error("expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect(String(error)).not.toContain("private-id");
      expect(String(error)).not.toContain("private data");
    }
  });

  it.each(["", 1, null, false, {}])("rejects invalid explicit column IDs without fallback #%#", (id) => {
    const grid = createGrid<Item>({ data: [], columns: [{ id: id as string, accessorKey: "value" }] });
    expect(() => grid.getAllColumns()).toThrow(/column.*position 0.*non-empty string/);
  });

  it("rejects an invalid runtime accessor key without coercion", () => {
    const grid = createGrid<Item>({ data: [], columns: [{ accessorKey: 0 as unknown as "value" }] });
    expect(() => grid.getAllColumns()).toThrow(TypeError);
  });

  it.each<AnyColumnDef<Item>[]>([
    [{ accessorKey: "value" }, { accessorKey: "value" }],
    [{ id: "same", columns: [{ id: "same", accessorKey: "value" }] }],
    [{ id: "a", columns: [{ id: "same" }] }, { id: "b", columns: [{ id: "same" }] }],
    [{ id: "column_1" }, {}],
  ])("rejects duplicate column IDs including groups, hidden columns, and fallback #%#", (...defs) => {
    const grid = createGrid<Item>({ data: [], columns: defs, initialState: { columnVisibility: { same: false, value: false } } });
    expect(() => grid.getAllLeafColumns()).toThrow(/duplicate column ID.*positions \d+ and \d+/);
  });

  it("allows the same accessor through distinct IDs and keeps existing fallback rules", () => {
    const grid = createGrid<Item>({ data: [item("row")], columns: [
      { id: "first", accessorKey: "value" }, { id: "second", accessorKey: "value" },
      { columns: [{ accessorFn: (row) => row.value }, {}] }, {},
    ] });
    expect(grid.getAllColumns().map((column) => column.id)).toEqual(["first", "second", "column_2", "column_3"]);
    expect(grid.getAllLeafColumns().map((column) => column.id)).toEqual(["first", "second", "column_2.0", "column_2.1", "column_3"]);
    expect(grid.getCoreRowModel().rows[0]?.getValue("second")).toBe("private data");
  });

  it("keeps validation lazy and calls getRowId once per row per new model", () => {
    const getRowId = vi.fn((row: Item) => row.id);
    const grid = createGrid<Item>({ data: [item("a"), item("b")], columns, getRowId });
    expect(getRowId).not.toHaveBeenCalled();
    const model = grid.getCoreRowModel();
    expect(Object.getOwnPropertyDescriptor(model, "rowsById")?.get).toBeTypeOf("function");
    grid.getCoreRowModel(); grid.getRowModel();
    expect(getRowId).toHaveBeenCalledTimes(2);
    grid.setOptions((previous) => ({ ...previous, data: [item("b"), item("a")] }));
    expect(getRowId).toHaveBeenCalledTimes(2);
    grid.getCoreRowModel();
    expect(getRowId).toHaveBeenCalledTimes(4);
  });

  it("recovers after rejected data or schema replacement without caching failure", () => {
    const grid = gridFor([item("a")]);
    const old = grid.getCoreRowModel();
    grid.setOptions((previous) => ({ ...previous, data: [item("b"), item("b")] }));
    expect(() => grid.getCoreRowModel()).toThrow(TypeError);
    expect(old.rowsById.a?.id).toBe("a");
    grid.setOptions((previous) => ({ ...previous, data: [item("c")] }));
    expect(grid.getCoreRowModel().rows[0]?.id).toBe("c");
    grid.setOptions((previous) => ({ ...previous, columns: [{ id: "x" }, { id: "x" }] }));
    expect(() => grid.getHeaderGroups()).toThrow(TypeError);
    grid.setOptions((previous) => ({ ...previous, columns }));
    expect(grid.getAllLeafColumns()[0]?.id).toBe("value");
  });

  it("keeps stable selection after reorder/insert/delete and across loaded server pages", () => {
    const grid = gridFor([item("a"), item("b")]);
    grid.toggleRowSelected("b");
    grid.setOptions((previous) => ({ ...previous, data: [item("new"), item("b"), item("a")] }));
    expect(grid.getSelectedRowModel().rows.map((row) => row.id)).toEqual(["b"]);
    grid.setOptions((previous) => ({ ...previous, data: [item("b")], manualPagination: true }));
    expect(grid.getSelectedRowModel().rows[0]?.id).toBe("b");
    grid.setOptions((previous) => ({ ...previous, data: [item("a")] }));
    expect(grid.getCoreRowModel().rows[0]?.id).toBe("a");
    expect(grid.getIsRowSelected("b")).toBe(true);
  });

  it("retains positional nested IDs when getRowId is omitted", () => {
    const grid = createGrid<Item>({ data: [item("a", [item("b")]), item("c")], columns, getSubRows: (row) => row.children });
    expect(grid.getCoreRowModel().flatRows.map((row) => row.id)).toEqual(["0", "0.0", "1"]);
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", " ", "한글", "a>b:c%"])("supports opaque IDs and column state #%#", (id) => {
    const grid = createGrid<Item>({ data: [item(id)], columns: [{ id, accessorKey: "value" }], getRowId: (row) => row.id });
    const column = grid.getAllLeafColumns()[0]!;
    expect(column.getSize()).toBe(160);
    expect(grid.getCoreRowModel().rowsById[id]?.getValue(id)).toBe("private data");
    grid.setColumnSize(id, 220);
    expect(column.getSize()).toBe(220);
    grid.toggleColumnVisibility(id, false);
    expect(column.getIsVisible()).toBe(false);
    grid.toggleColumnVisibility(id);
    expect(column.getIsVisible()).toBe(true);
    grid.setColumnVisibility(Object.create({ [id]: false }));
    expect(column.getIsVisible()).toBe(true);
  });

  it("escapes group ID segments so delimiter-like values cannot alias a child group", () => {
    const grid = createGrid<Item>({ data: [
      { id: "a", value: "x>other:y", other: "z" }, { id: "b", value: "x", other: "y" },
      { id: "c", value: "x%3Eother%3Ay", other: "z" },
    ], columns: [{ accessorKey: "value" }, { accessorKey: "other" }], getRowId: (row) => row.id,
    groupFooterMode: "expanded", initialState: { grouping: ["value", "other"], pagination: { pageIndex: 0, pageSize: 50 } } });
    grid.toggleAllRowsExpanded(true);
    const model = grid.getRowModel();
    expect(new Set(model.rows.map((row) => row.id)).size).toBe(model.rows.length);
    for (const row of model.rows) expect(model.rowsById[row.id]).toBe(row);
    expect(grid.getGroupedRowModel().rows.map((row) => row.id)).toContain("__group__value:x%3Eother%3Ay");
  });
});
