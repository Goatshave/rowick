import { describe, expect, it, vi } from "vitest";
import { createGrid, type Grid, type GridOptions } from "../src";
import { compileFilterExpression, getFilterOperators, parseFilterExpression, serializeFilterExpression, validateFilterExpression, excludeFilterColumn,
  type FilterColumnPolicy, type FilterCondition, type FilterExpression, type FilterGroup, type FilterNode, type FilterOperator } from "../src/filter-expression";
const columns: readonly FilterColumnPolicy[] = [{ id: "name", type: "text" }, { id: "amount", type: "number" }, { id: "money", type: "decimal" },
  { id: "date", type: "date" }, { id: "active", type: "boolean" }, { id: "__proto__", type: "text" }];
const condition = (columnId: string, operator: FilterOperator, value?: FilterCondition["value"]): FilterCondition => ({ kind: "condition", columnId, operator, ...(value !== undefined ? { value } : {}) });
const expression = (root: FilterNode | null): FilterExpression => ({ version: 1, root });
const matches = (root: FilterNode | null, record: Record<string, unknown>) => compileFilterExpression(expression(root), columns)((id) => Object.hasOwn(record, id) ? record[id] : undefined);

describe("versioned filter expressions", () => {
  it("combines nested AND/OR with explicit empty-group semantics", () => {
    const root: FilterGroup = { kind: "group", operator: "and", children: [condition("amount", "gte", 3),
      { kind: "group", operator: "or", children: [condition("name", "starts-with", "A"), condition("active", "eq", true)] }] };
    expect(matches(root, { amount: 4, name: "Alpha", active: false })).toBe(true);
    expect(matches(root, { amount: 2, name: "Alpha", active: true })).toBe(false);
    expect(matches(root, { amount: 4, name: "Beta", active: false })).toBe(false);
    expect(matches({ kind: "group", operator: "and", children: [] }, {})).toBe(true);
    expect(matches({ kind: "group", operator: "or", children: [] }, {})).toBe(false); expect(matches(null, {})).toBe(true);
  });
  it.each([
    ["contains", "PH", true], ["not-contains", "PH", false], ["starts-with", "al", true], ["ends-with", "HA", true],
    ["eq", "alpha", true], ["neq", "alpha", false], ["lt", "Beta", true], ["gt", "Beta", false],
  ] as const)("evaluates case-independent text %s", (operator, value, expected) => expect(matches(condition("name", operator, value), { name: "Alpha" })).toBe(expected));
  it("preserves opt-in case sensitivity and avoids text coercion", () => {
    expect(matches({ ...condition("name", "eq", "alpha"), caseSensitive: true }, { name: "Alpha" })).toBe(false);
    expect(matches(condition("name", "contains", "1"), { name: 1 })).toBe(false);
    expect(matches(condition("amount", "eq", 1), { amount: "1" })).toBe(false);
  });
  it.each(["gt", "gte", "lt", "lte", "between", "in", "not-in"] as const)("supports typed numeric comparison %s", (operator) => {
    const value = operator === "between" ? [1, 3] : operator === "in" || operator === "not-in" ? [2] : 2;
    expect(matches(condition("amount", operator, value), { amount: 2 })).toBe(!["gt", "lt", "not-in"].includes(operator));
    expect(matches(condition("amount", operator, value), { amount: NaN })).toBe(false);
  });
  it("normalizes missing to null, distinguishes empty strings and keeps empty sets explicit", () => {
    expect(matches(condition("name", "eq", null), {})).toBe(true); expect(matches(condition("name", "eq", null), { name: "" })).toBe(false);
    expect(matches(condition("name", "is-empty"), { name: "" })).toBe(true); expect(matches(condition("name", "is-not-empty"), { name: " " })).toBe(true);
    expect(matches(condition("name", "in", []), { name: "A" })).toBe(false); expect(matches(condition("name", "not-in", []), { name: "A" })).toBe(true);
  });
  it.each([
    ["9007199254740993.01", "9007199254740993.00", "gt", true], ["0001.20", "+1.2", "eq", true],
    ["-0.00", "0", "eq", true], ["-10", "-2", "lt", true], ["1.0000000000000000001", "1.0000000000000000000", "gt", true],
  ] as const)("compares exact decimals %s %s", (left, right, operator, expected) => expect(matches(condition("money", operator, right), { money: left })).toBe(expected));
  it("uses strict calendar strings and boolean values without implicit date/time conversions", () => {
    expect(matches(condition("date", "between", ["2024-02-01", "2024-02-29"]), { date: "2024-02-29" })).toBe(true);
    expect(matches(condition("date", "gte", "2024-01-01"), { date: new Date("2024-02-29") })).toBe(false);
    expect(matches(condition("active", "in", [false]), { active: false })).toBe(true);
    expect(matches(condition("active", "eq", true), { active: "true" })).toBe(false);
  });
  it("roundtrips canonical immutable expressions and supports special column IDs", () => {
    const original = expression(condition("__proto__", "eq", "allowed")), json = serializeFilterExpression(original, columns), parsed = parseFilterExpression(json, columns);
    expect(parsed).toEqual(original); expect(Object.isFrozen(parsed.root)).toBe(true); expect(matches(parsed.root, JSON.parse('{"__proto__":"allowed"}'))).toBe(true);
    const group: FilterGroup = { kind: "group", operator: "or", children: [condition("name", "in", ["Alpha"])] };
    const validated = validateFilterExpression(expression(group), columns); expect(Object.isFrozen((validated.root as FilterGroup).children)).toBe(true);
    expect(Object.isFrozen(((validated.root as FilterGroup).children[0] as FilterCondition).value)).toBe(true);
  });
  it.each([
    { version: 2, root: null }, { root: null }, { version: 1 }, { version: 1, root: null, extra: true },
    expression(condition("unknown", "eq", "x")), expression(condition("amount", "contains", 1)), expression(condition("amount", "eq", "1")),
    expression(condition("amount", "eq", Infinity)), expression(condition("date", "eq", "2025-02-29")), expression(condition("money", "eq", "1e3")),
    expression(condition("active", "gt", true)), expression(condition("amount", "between", [3, 1])), expression(condition("name", "between", [null, "z"])),
    expression(condition("name", "is-empty", "x")), expression({ ...condition("amount", "eq", 1), caseSensitive: true }),
    expression({ kind: "group", operator: "xor", children: [] } as never),
  ])("rejects malformed, unknown and type-incompatible expressions %#", (input) => expect(() => validateFilterExpression(input, columns)).toThrow());
  it("enforces server-side operator allowlists", () => {
    const restricted: FilterColumnPolicy[] = [{ id: "name", type: "text", operators: ["eq"] }];
    expect(() => compileFilterExpression(expression(condition("name", "contains", "a")), restricted)).toThrow(/forbidden/);
    const predicate = compileFilterExpression(expression(condition("name", "eq", "a")), restricted); restricted[0] = { id: "name", type: "number" };
    expect(predicate(() => "a")).toBe(true); expect(getFilterOperators("boolean")).not.toContain("gt");
  });
  it("rejects cycles, sparse arrays, getters and prototype-shaped payloads without invoking accessors", () => {
    const children: FilterNode[] = [], cyclic: FilterGroup = { kind: "group", operator: "and", children }; children.push(cyclic);
    expect(() => validateFilterExpression(expression(cyclic), columns)).toThrow(/Cyclic/);
    expect(() => validateFilterExpression(expression({ kind: "group", operator: "and", children: new Array(1) }), columns)).toThrow(/sparse/);
    expect(() => validateFilterExpression(expression(condition("name", "in", new Array(1))), columns)).toThrow(/sparse/);
    const getter = vi.fn(() => null), input = { version: 1 }; Object.defineProperty(input, "root", { get: getter, enumerable: true });
    expect(() => validateFilterExpression(input, columns)).toThrow(); expect(getter).not.toHaveBeenCalled();
    expect(() => parseFilterExpression('{"version":1,"root":null,"__proto__":{}}', columns)).toThrow();
  });
  it("bounds depth, nodes, literals, sets and JSON size", () => {
    let root: FilterNode = condition("name", "eq", "a"); for (let index = 0; index < 9; index++) root = { kind: "group", operator: "and", children: [root] };
    expect(() => validateFilterExpression(expression(root), columns)).toThrow(/too large/);
    expect(() => validateFilterExpression(expression(condition("name", "eq", "x".repeat(1001))), columns)).toThrow();
    expect(() => validateFilterExpression(expression(condition("name", "in", Array(201).fill("a"))), columns)).toThrow();
    expect(() => validateFilterExpression(expression(condition("name", "in", Array(20).fill("x".repeat(1000)))), columns)).toThrow(/budget/);
    expect(() => parseFilterExpression(" ".repeat(262_145), columns)).toThrow(/too large/);
    expect(() => validateFilterExpression(expression(null), columns, { maxNodes: 0 })).toThrow(/limit/);
  });
  it("prunes the requested column while preserving original empty-OR groups and validating the full source", () => {
    const source = expression({ kind: "group", operator: "and", children: [condition("amount", "gt", 1), { kind: "group", operator: "or", children: [condition("name", "eq", "A")] }] });
    const excluded = excludeFilterColumn(source, "name", columns);
    expect(compileFilterExpression(excluded, columns)((id) => id === "amount" ? 3 : "B")).toBe(true);
    expect(excludeFilterColumn(expression(condition("name", "eq", "A")), "name", columns).root).toBeNull();
    const emptyOr = expression({ kind: "group", operator: "or", children: [] }); expect(compileFilterExpression(excludeFilterColumn(emptyOr, "name", columns), columns)(() => "A")).toBe(false);
    expect(() => excludeFilterColumn(expression(condition("forbidden", "eq", "x")), "name", columns)).toThrow();
  });
});

describe("grid expression integration and query paging", () => {
  const rows = [{ id: "a", name: "Alpha", amount: 1 }, { id: "b", name: "Beta", amount: 3 }, { id: "c", name: "Alpha", amount: 5 }];
  type Item = typeof rows[number];
  const makeGrid = (options: Partial<GridOptions<Item>> = {}) => createGrid<Item>({ data: rows,
    columns: [{ accessorKey: "name", enableGlobalFiltering: false }, { accessorKey: "amount", filterValueType: "number", enableGlobalFiltering: false }],
    getRowId: (row) => row.id, ...options });
  it("filters without any global-filterable columns and preserves cached model identity", () => {
    const grid = makeGrid(), core = grid.getCoreRowModel(); grid.setFilterExpression(expression(condition("amount", "gte", 3)));
    expect(grid.getFilteredRowModel().rows.map((row) => row.id)).toEqual(["b", "c"]);
    expect(grid.getFilteredRowModel()).toBe(grid.getFilteredRowModel()); expect(core.rows).toHaveLength(3);
    grid.setFilterExpression(null); expect(grid.getFilteredRowModel()).toBe(core);
  });
  it("ANDs expressions with simple/custom column filters and quick search", () => {
    const grid = makeGrid({ columns: [{ accessorKey: "name", filterFn: (value, filter) => value === filter }, { accessorKey: "amount", filterValueType: "number" }] });
    grid.setFilterExpression(expression(condition("amount", "gte", 3))); grid.setColumnFilters([{ id: "name", value: "Alpha" }]);
    expect(grid.getFilteredRowModel().rows.map((row) => row.id)).toEqual(["c"]); grid.setGlobalFilter("Beta"); expect(grid.getFilteredRowModel().rows).toEqual([]);
  });
  it("rejects malformed expressions atomically and validates controlled/manual expressions", () => {
    const notify = vi.fn(), grid = makeGrid({ onStateChange: notify }), before = grid.getState();
    expect(() => grid.setFilterExpression(expression(condition("amount", "contains", 2)))).toThrow(); expect(grid.getState()).toBe(before); expect(notify).not.toHaveBeenCalled();
    const manual = makeGrid({ manualFiltering: true }); manual.setFilterExpression(expression(condition("amount", "gt", 2)));
    expect(manual.getFilteredRowModel()).toBe(manual.getCoreRowModel());
    manual.setOptions((options) => ({ ...options, state: { filterExpression: expression(condition("unknown", "eq", "bad")) } }));
    expect(() => manual.getFilteredRowModel()).toThrow(/forbidden/);
  });
  it("keeps matching descendants with ancestor context", () => {
    interface Node { id: string; name: string; children?: Node[]; }
    const grid = createGrid<Node>({ data: [{ id: "parent", name: "Parent", children: [{ id: "child", name: "Match" }] }], columns: [{ accessorKey: "name" }], getRowId: (row) => row.id, getSubRows: (row) => row.children });
    grid.setFilterExpression(expression(condition("name", "eq", "Match")));
    expect(grid.getFilteredRowModel().flatRows.map((row) => row.id)).toEqual(["parent", "child"]);
  });
  it("uses leaf schema policies including hidden columns and excluding forbidden columns", () => {
    const grid = makeGrid({ columns: [{ id: "group", columns: [{ accessorKey: "amount", filterType: "number-range" }, { accessorKey: "name", enableFiltering: false }] }], initialState: { columnVisibility: { amount: false } } });
    expect(grid.getFilterColumnPolicies()).toEqual([{ id: "amount", type: "number" }]);
    expect(() => grid.setFilterExpression(expression(condition("name", "eq", "Alpha")))).toThrow();
  });
  it("fails visibly after removing a filtered schema column and recovers on reset", () => {
    const grid = makeGrid(); grid.setFilterExpression(expression(condition("amount", "gt", 1)));
    grid.setOptions((options) => ({ ...options, columns: [{ accessorKey: "name" }] })); expect(() => grid.getFilteredRowModel()).toThrow();
    grid.setFilterExpression(null); expect(grid.getFilteredRowModel().rows).toHaveLength(3);
  });
  it("facets exclude the current column's simple/advanced predicates while retaining other/custom/global filters", () => {
    const grid = makeGrid({ columns: [{ accessorKey: "name" }, { accessorKey: "amount", filterValueType: "number", filterFn: (value, query) => Number(value) >= Number(query) }] });
    grid.setColumnFilters([{ id: "amount", value: 3 }, { id: "name", value: "Beta" }]);
    grid.setFilterExpression(expression({ kind: "group", operator: "and", children: [condition("name", "eq", "Beta"), condition("amount", "gte", 3)] }));
    expect(grid.getFilteredRowModel().rows.map((row) => row.id)).toEqual(["b"]);
    const facet = grid.getFacetedRowModel("name"); expect(facet.rows.map((row) => row.id)).toEqual(["b", "c"]); expect(grid.getFacetedRowModel("name")).toBe(facet);
    grid.setGlobalFilter("Alpha"); expect(grid.getFacetedRowModel("name").rows.map((row) => row.id)).toEqual(["c"]);
    expect(() => grid.getFacetedRowModel("unknown")).toThrow();
  });
  it("keeps only four facet models and invalidates them after immutable source updates", () => {
    const data = [Object.fromEntries(["id", "a", "b", "c", "d", "e"].map((id) => [id, id === "id" ? "row" : "x"]))];
    const grid = createGrid({ data, columns: ["a", "b", "c", "d", "e"].map((accessorKey) => ({ accessorKey })), getRowId: (row) => row.id! });
    grid.setGlobalFilter("x"); const first = grid.getFacetedRowModel("a");
    for (const id of ["b", "c", "d", "e"]) grid.getFacetedRowModel(id);
    expect(grid.getFacetedRowModel("a")).not.toBe(first);
    grid.setOptions((options) => ({ ...options, data: [{ ...data[0]!, a: "new" }] })); expect(grid.getFacetedRowModel("a").rows[0]?.original?.a).toBe("new");
  });
  const setters: Array<(grid: Grid<Item>) => void> = [
    (grid) => grid.setSorting([{ id: "name" }]), (grid) => grid.toggleColumnSorting("name"),
    (grid) => grid.setColumnFilters([{ id: "name", value: "Alpha" }]), (grid) => grid.setGlobalFilter("Alpha"),
    (grid) => grid.setFilterExpression(expression(condition("amount", "gt", 1))), (grid) => grid.setGrouping(["name"]), (grid) => grid.toggleColumnGrouping("name"),
  ];
  it.each(setters)("resets the query page with one state proposal %#", (setQuery) => {
    const changed = vi.fn(), grid = makeGrid({ initialState: { pagination: { pageIndex: 2, pageSize: 1 } }, onStateChange: changed });
    setQuery(grid); expect(grid.getState().pagination.pageIndex).toBe(0); expect(changed).toHaveBeenCalledTimes(1);
    const optOut = makeGrid({ autoResetPageIndex: false, initialState: { pagination: { pageIndex: 2, pageSize: 1 } } });
    setQuery(optOut); expect(optOut.getState().pagination.pageIndex).toBe(2);
  });
  it("preserves controlled page ownership while proposing a reset, and respects full-state restoration", () => {
    const changed = vi.fn(), grid = makeGrid({ state: { pagination: { pageIndex: 2, pageSize: 1 } }, onStateChange: changed });
    grid.setGlobalFilter("A"); expect(changed.mock.calls[0]?.[0].pagination.pageIndex).toBe(0); expect(grid.getState().pagination.pageIndex).toBe(2);
    const own = makeGrid(); own.setState((state) => ({ ...state, sorting: [{ id: "name" }], pagination: { pageIndex: 1, pageSize: 1 } })); expect(own.getState().pagination.pageIndex).toBe(1);
  });
});
