import { afterEach, describe, expect, it, vi } from "vitest";
import { createGrid, type FilterColumnPolicy, type FilterExpression, type FilterOperator, type Grid, type GridState } from "@rowick/core";
import { applySavedGridView, calculateFacets, createFacetSearchController, createFilterPanelController, createSavedGridView, excludeFacetColumn, getSavedViewSchema, importLayoutPreferencesView, parseSavedGridView, serializeSavedGridView, validateSavedGridView,
  type FacetValue, type FilterDraftCondition, type FilterPanelStorage, type SavedGridView } from "../src/filtering";
interface RecordRow { id: string; name: string; amount: number; money: string; region: string; active: boolean; }
const rows: readonly RecordRow[] = [
  { id: "a", name: "Alpha", amount: 1, money: "9007199254740993.1", region: "Seoul", active: true },
  { id: "b", name: "Beta", amount: 2, money: "9007199254740993.2", region: "Seoul", active: false },
  { id: "c", name: "Gamma", amount: 3, money: "9007199254740993.3", region: "Tokyo", active: true },
];
const columns = [{ accessorKey: "name" as const }, { accessorKey: "amount" as const, filterValueType: "number" as const }, { accessorKey: "money" as const, filterValueType: "decimal" as const }, { accessorKey: "region" as const }, { accessorKey: "active" as const, filterValueType: "boolean" as const }];
const stops: Array<() => void> = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.useRealTimers(); });
function makeGrid(options: Partial<Parameters<typeof createGrid<RecordRow>>[0]> = {}) { return createGrid<RecordRow>({ data: rows, columns, getRowId: (row) => row.id, ...options }); }
function fixture(options: Partial<Parameters<typeof createFilterPanelController<RecordRow>>[0]> = {}) {
  const grid = options.grid ?? makeGrid(), controller = createFilterPanelController({ ...options, grid }); stops.push(controller.dispose); return { grid, controller };
}
const rootCondition = (columnId: string, operator: FilterOperator, value: unknown): FilterExpression => ({ version: 1, root: { kind: "condition", columnId, operator, value: value as never } });
function add(controller: ReturnType<typeof createFilterPanelController>, patch: Partial<FilterDraftCondition> = {}) {
  controller.addCondition(controller.getState().draft.id); const node = controller.getState().draft.children.at(-1)!; if (node.kind !== "condition") throw new Error("Expected condition"); controller.updateCondition(node.id, patch); return node.id;
}
function memoryStorage() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("filter builder and settings", () => {
  it("starts clean, keeps a draft separate from results, applies and resets", () => {
    const { grid, controller } = fixture(), first = controller.getState(); expect(controller.getState()).toBe(first); expect(first.dirty).toBe(false);
    add(controller, { input: "Alpha" }); expect(grid.getFilteredRowModel().rows).toHaveLength(3); expect(controller.getState().dirty).toBe(true);
    expect(controller.apply()).toBe(true); expect(grid.getFilteredRowModel().rows.map((row) => row.id)).toEqual(["a"]); expect(controller.getState()).toMatchObject({ dirty: false, activeConditionCount: 1, message: undefined });
    controller.reset(); expect(grid.getState().filterExpression).toBeNull(); expect(grid.getFilteredRowModel().rows).toHaveLength(3);
  });
  it("supports typed conditions, nested groups and inclusive bounds", () => {
    const { grid, controller } = fixture(); const root = controller.getState().draft.id; add(controller, { columnId: "amount" });
    const amount = controller.getState().draft.children[0]!; controller.updateCondition(amount.id, { operator: "gte", input: "2" });
    controller.addGroup(root); const group = controller.getState().draft.children[1]!; controller.setGroupOperator(group.id, "or"); controller.addCondition(group.id);
    const inside = controller.getState().draft.children[1]!; if (inside.kind !== "group") throw new Error("Expected group"); controller.updateCondition(inside.children[0]!.id, { input: "Beta" });
    controller.addCondition(group.id); const next = controller.getState().draft.children[1]!; if (next.kind !== "group") throw new Error("Expected group"); controller.updateCondition(next.children[1]!.id, { input: "Gamma" });
    expect(controller.apply()).toBe(true); expect(grid.getFilteredRowModel().rows.map((row) => row.id)).toEqual(["b", "c"]);
  });
  it("retains invalid typed raw input and identifies the field without changing the grid", () => {
    const { grid, controller } = fixture(), id = add(controller, { columnId: "amount" }); controller.updateCondition(id, { input: "invalid" });
    expect(controller.apply()).toBe(false); expect(controller.getState().errors[id]).toMatch(/finite number/); expect(grid.getState().filterExpression).toBeNull();
    controller.updateCondition(id, { input: "2" }); expect(controller.apply()).toBe(true);
  });
  it("honors combined column/value patches and clears missing mode when changing operators", () => {
    const { grid, controller } = fixture(), id = add(controller, { columnId: "amount", operator: "gte", input: "2" }); expect(controller.apply()).toBe(true); expect(grid.getFilteredRowModel().rows).toHaveLength(2);
    const loaded = controller.getState().draft.children[0]!; controller.updateCondition(loaded.id, { operator: "eq", nullValue: true }); controller.updateCondition(loaded.id, { operator: "between", input: "1", secondInput: "2" });
    expect((controller.getState().draft.children[0] as FilterDraftCondition).nullValue).toBe(false); expect(controller.apply()).toBe(true);
  });
  it("rejects forged draft identity patches and invalid public limits", () => {
    const { controller } = fixture(), id = add(controller), draft = controller.getState().draft;
    expect(() => controller.updateCondition(id, { id: "forged" } as never)).toThrow(/patch/); expect(controller.getState().draft).toBe(draft);
    expect(() => fixture({ maxFacetValues: 0 })).toThrow(/limit/); expect(() => fixture({ maxFacetRows: Infinity })).toThrow(/limit/);
  });
  it("accepts exact decimal and typed JSON-list values without coercion", () => {
    const { grid, controller } = fixture(), id = add(controller, { columnId: "money" }); controller.updateCondition(id, { operator: "gt", input: "9007199254740993.15" });
    expect(controller.apply()).toBe(true); expect(grid.getFilteredRowModel().rows.map((row) => row.id)).toEqual(["b", "c"]);
    controller.reset(); const next = add(controller, { columnId: "amount" }); controller.updateCondition(next, { operator: "in", input: '[2,"3"]' }); expect(controller.apply()).toBe(false);
    controller.updateCondition(next, { input: "[2,3]" }); expect(controller.apply()).toBe(true); expect(grid.getFilteredRowModel().rows).toHaveLength(2);
  });
  it("rejects stale drafts after an external filter replacement and explicitly reloads", () => {
    const { grid, controller } = fixture(); add(controller, { input: "Mine" }); grid.setFilterExpression(rootCondition("name", "eq", "Beta"));
    expect(controller.getState().stale).toBe(true); expect(controller.apply()).toBe(false); expect(grid.getFilteredRowModel().rows[0]?.id).toBe("b");
    controller.reload(); expect(controller.getState().stale).toBe(false); expect(controller.getState().dirty).toBe(false);
  });
  it("retains controlled proposals until the owner accepts them", () => {
    let proposed: GridState | undefined; const grid = makeGrid({ state: { filterExpression: null }, onStateChange: (state) => { proposed = state; } }), { controller } = fixture({ grid });
    add(controller, { input: "Beta" }); expect(controller.apply()).toBe(true); expect(controller.getState()).toMatchObject({ dirty: true, stale: false, message: expect.stringContaining("controlled owner") });
    grid.setOptions((options) => ({ ...options, state: { filterExpression: proposed!.filterExpression } })); expect(controller.getState()).toMatchObject({ dirty: false, stale: false, message: undefined });
    controller.reset(); expect(controller.getState().draft.children).toEqual([]); expect(controller.getState().message).toMatch(/controlled owner/);
    grid.setOptions((options) => ({ ...options, state: { filterExpression: proposed!.filterExpression } })); expect(controller.getState()).toMatchObject({ dirty: false, stale: false });
  });
  it("limits builder depth and size and rejects unavailable operators", () => {
    const { controller } = fixture(); let group = controller.getState().draft;
    for (let index = 0; index < 7; index++) { controller.addGroup(group.id); group = group.children[0] as never; let current = controller.getState().draft; for (let depth = 0; depth <= index; depth++) current = current.children[0] as typeof current; group = current; }
    expect(() => controller.addGroup(group.id)).toThrow(/limit/);
    const another = fixture(); const id = add(another.controller, { columnId: "active" }); expect(() => another.controller.updateCondition(id, { operator: "gt" })).toThrow(/Invalid condition/);
  });
  it("respects protected columns and keeps at least one visible column", () => {
    const { grid, controller } = fixture({ canConfigureColumn: (id) => id !== "name" });
    expect(() => controller.setColumnVisible("name", false)).toThrow(/unavailable/); expect(() => controller.moveColumn("amount", "before")).toThrow(/protected/);
    for (const id of ["amount", "money", "region", "active"]) controller.setColumnVisible(id, false); expect(grid.getVisibleLeafColumns().map((column) => column.id)).toEqual(["name"]);
    const last = fixture({ grid: makeGrid({ columns: [{ accessorKey: "name" }] }) }); expect(() => last.controller.setColumnVisible("name", false)).toThrow(/visible/);
    controller.setColumnPinned("amount", "left"); expect(grid.getAllLeafColumns().find((column) => column.id === "amount")?.getIsPinned()).toBe("left"); controller.setColumnSize("amount", 250); expect(grid.getColumnSize("amount")).toBe(250);
  });
  it("reuses local facets through focus changes, searches beyond the first capped values, and clears a removed facet column", () => {
    const { grid, controller } = fixture({ maxFacetValues: 1 }); controller.setFacetColumn("name"); const first = controller.getState().facets;
    grid.setFocusedCell({ rowId: "a", columnId: "name" }); expect(controller.getState().facets).toBe(first);
    void controller.searchFacets("Gamma"); expect(controller.getState().facets?.values).toEqual([{ value: "Gamma", count: 1 }]);
    grid.setOptions((options) => ({ ...options, columns: [{ accessorKey: "amount", filterValueType: "number" }] })); expect(controller.getState().facetColumnId).toBeUndefined();
  });
  it("retains global/simple filters when excluding a facet column's own conditions", () => {
    const { grid, controller } = fixture(); grid.setColumnFilters([{ id: "region", value: "Seoul" }]); controller.setFacetColumn("name"); expect(controller.getState().facets?.values.map((value) => value.value)).toEqual(["Alpha", "Beta"]);
    grid.setGlobalFilter("Beta"); expect(controller.getState().facets?.values).toEqual([{ value: "Beta", count: 1 }]); controller.setFacetColumn("region"); expect(controller.getState().facets?.values).toEqual([{ value: "Seoul", count: 1 }]);
  });
  it("disposes without affecting the grid or retaining subscriptions", () => {
    const { grid, controller } = fixture(), listener = vi.fn(); controller.subscribe(listener); controller.dispose(); controller.dispose(); grid.setGlobalFilter("Alpha"); expect(listener).not.toHaveBeenCalled(); expect(() => controller.addCondition("x")).toThrow(/disposed/);
  });
});

describe("facets and server candidate search", () => {
  const policies: readonly FilterColumnPolicy[] = [{ id: "name", type: "text" }, { id: "amount", type: "number" }, { id: "money", type: "decimal" }, { id: "region", type: "text" }];
  it("removes its own conditions while preserving the other group's AND/OR meaning", () => {
    const expression: FilterExpression = { version: 1, root: { kind: "group", operator: "and", children: [rootCondition("name", "eq", "Alpha").root!, rootCondition("region", "eq", "Seoul").root!] } };
    const result = calculateFacets(rows, policies, "name", (row, id) => row[id as keyof RecordRow], { expression }); expect(result.values.map((facet) => facet.value)).toEqual(["Alpha", "Beta"]);
    expect(calculateFacets(rows, policies, "name", (row, id) => row[id as keyof RecordRow], { expression, excludeOwnConditions: false }).values).toEqual([{ value: "Alpha", count: 1 }]);
    expect(excludeFacetColumn(rootCondition("name", "eq", "Alpha"), "name").root).toBeNull();
  });
  it("caps distinct memory and row scans while retaining exact counts for included values", () => {
    const source = [{ name: "A" }, { name: "B" }, { name: "a" }, { name: "C" }];
    const result = calculateFacets(source, policies, "name", (row) => row.name, { maxValues: 1 }); expect(result).toMatchObject({ values: [{ value: "A", count: 2 }], distinctCountAtLeast: 2, truncated: true, matchedRowCount: 4 });
    expect(calculateFacets(source, policies, "name", (row) => row.name, { maxRows: 2 }).scannedRowCount).toBe(2);
  });
  it("merges decimal spellings by exact equality and computes precise ranges", () => {
    const source = ["9007199254740993.2", "9007199254740993.10", "+09007199254740993.200"].map((money) => ({ money }));
    const result = calculateFacets(source, policies, "money", (row) => row.money); expect(result.values).toEqual([{ value: "9007199254740993.2", count: 2 }, { value: "9007199254740993.10", count: 1 }]);
    expect(result.minimum).toBe("9007199254740993.10"); expect(result.maximum).toBe("9007199254740993.2");
  });
  it("normalizes missing, rejects unsupported data values and enforces limits", () => {
    const source = [null, undefined, NaN, {}, "text", 1]; const result = calculateFacets(source, policies, "amount", (value) => value);
    expect(result.values).toEqual([{ value: null, count: 2 }, { value: 1, count: 1 }]); expect(result.invalidValueCount).toBe(3);
    expect(() => calculateFacets(rows, policies, "unknown", () => "")).toThrow(/Unknown/); expect(() => calculateFacets(rows, policies, "name", () => "", { maxValues: 0 })).toThrow(/limit/);
  });
  it("deduplicates in-flight searches, aborts obsolete requests and fences late results", async () => {
    const old = deferred<{ values: readonly FacetValue[] }>(), fresh = deferred<{ values: readonly FacetValue[] }>(); let oldSignal: AbortSignal | undefined;
    const provider = vi.fn((request) => { if (request.query === "old") oldSignal = request.signal; return request.query === "old" ? old.promise : fresh.promise; });
    const search = createFacetSearchController({ columns: policies, search: provider }); stops.push(search.dispose);
    const first = search.search("name", "old", null), duplicate = search.search("name", "old", null); expect(duplicate).toBe(first); for (let index = 0; index < 5; index++) await Promise.resolve();
    const second = search.search("name", "new", null); expect(oldSignal?.aborted).toBe(true); fresh.resolve({ values: [{ value: "New", count: 2 }] }); await second; old.resolve({ values: [{ value: "Old", count: 1 }] }); await first;
    expect(search.getState()).toMatchObject({ query: "new", values: [{ value: "New", count: 2 }], loading: false }); expect(provider).toHaveBeenCalledTimes(2);
  });
  it("rejects oversized/duplicate/type-invalid server values and exposes retry", async () => {
    let attempts = 0; const search = createFacetSearchController({ columns: policies, maxValues: 1, search: async () => ++attempts === 1 ? { values: [{ value: "a", count: 1 }, { value: "b", count: 1 }] } : { values: [{ value: "a", count: 2 }] } }); stops.push(search.dispose);
    await search.search("name", "query", null); expect(search.getState().error).toMatch(/Too many/); await search.retry(); expect(search.getState().values).toEqual([{ value: "a", count: 2 }]);
    const duplicate = createFacetSearchController({ columns: policies, search: async () => ({ values: [{ value: "A", count: 1 }, { value: "a", count: 1 }] }) }); stops.push(duplicate.dispose); await duplicate.search("name", "", null); expect(duplicate.getState().error).toMatch(/Invalid/);
  });
  it("times out, detects query-context changes and ignores disposed completions", async () => {
    vi.useFakeTimers(); const work = deferred<{ values: readonly FacetValue[] }>(); let context = "one";
    const search = createFacetSearchController({ columns: policies, timeoutMs: 10, getContextKey: () => context, search: () => work.promise }); stops.push(search.dispose);
    const pending = search.search("name", "", null); await vi.advanceTimersByTimeAsync(11); await pending; expect(search.getState().error).toBeTruthy();
    const next = search.retry(); context = "two"; work.resolve({ values: [{ value: "A", count: 1 }] }); await next; expect(search.getState().values).toEqual([]); expect(search.getState().error).toMatch(/changed/);
    const listener = vi.fn(); search.subscribe(listener); search.dispose(); expect(listener).not.toHaveBeenCalled();
  });
});

describe("saved view version, schema and persistence", () => {
  it("roundtrips complete query/layout without storing data, selection, focus or page index", () => {
    const grid = makeGrid(); grid.setFilterExpression(rootCondition("amount", "gte", 2)); grid.setSorting([{ id: "amount", desc: true }]); grid.toggleColumnVisibility("money", false); grid.pinColumn("name", "left"); grid.setColumnSize("name", 250); grid.setFocusedCell({ rowId: "a", columnId: "name" });
    const view = createSavedGridView(grid, { id: "one", name: "Operations", density: "compact" }), json = serializeSavedGridView(view, getSavedViewSchema(grid));
    expect(parseSavedGridView(json, getSavedViewSchema(grid))).toEqual(view); expect(json).not.toMatch(/Alpha|rowSelection|focusedCell|pageIndex/); expect(Object.isFrozen(view.query)).toBe(true);
    const other = makeGrid(), listener = vi.fn(); other.subscribe(listener); applySavedGridView(other, view); expect(listener).toHaveBeenCalledTimes(1); expect(other.getFilteredRowModel().rows.map((row) => row.id)).toEqual(["b", "c"]); expect(other.getColumnSize("name")).toBe(250);
  });
  it("normalizes the core's omitted ascending sort direction", () => {
    const grid = makeGrid(); grid.setSorting([{ id: "amount" }]); expect(createSavedGridView(grid, { id: "one", name: "Ascending" }).query.sorting).toEqual([{ id: "amount", desc: false }]);
  });
  it("rejects unknown versions/schema references and malformed state before changing anything", () => {
    const grid = makeGrid(); grid.toggleColumnVisibility("money", false); const view = createSavedGridView(grid, { id: "one", name: "Test" }), before = grid.getState();
    for (const invalid of [{ ...view, version: 2 }, { ...view, pageSize: Infinity }, { ...view, query: { ...view.query, sorting: [{ id: "unknown", desc: true }] } }, { ...view, preferences: { ...view.preferences, state: { ...view.preferences.state, columnOrder: ["name", "name"] } } }]) expect(() => applySavedGridView(grid, invalid)).toThrow();
    expect(grid.getState()).toBe(before);
    const old = makeGrid({ columns: [{ accessorKey: "name" }] }); expect(() => applySavedGridView(old, view)).toThrow();
  });
  it("supports explicit bounded version migration and legacy preferences v1 import", () => {
    const grid = makeGrid(), view = createSavedGridView(grid, { id: "one", name: "Test" });
    expect(validateSavedGridView({ ...view, version: 0 }, { ...getSavedViewSchema(grid), migrations: [{ fromVersion: 0, toVersion: 1, migrate: (value) => ({ ...value, version: 1 }) }] })).toEqual(view);
    expect(() => validateSavedGridView({ version: 0 }, { ...getSavedViewSchema(grid), migrations: [{ fromVersion: 0, toVersion: 0, migrate: (value) => value }] })).toThrow();
    const legacy = importLayoutPreferencesView(grid, { version: 1, density: "comfortable", state: { columnVisibility: { name: false }, columnSizing: {}, columnOrder: [], columnPinning: { left: [], right: [] } } }, "legacy", "Legacy");
    expect(legacy.preferences.density).toBe("comfortable"); expect(legacy.query).toEqual(view.query);
  });
  it("rejects sparse rules and getters without executing accessors", () => {
    const grid = makeGrid(), view = createSavedGridView(grid, { id: "safe", name: "Safe" }), getter = vi.fn(() => "name");
    expect(() => validateSavedGridView({ ...view, query: { ...view.query, sorting: new Array(1) } }, getSavedViewSchema(grid))).toThrow(/Sparse/);
    const sizing = {}; Object.defineProperty(sizing, "name", { get: getter, enumerable: true });
    expect(() => validateSavedGridView({ ...view, preferences: { ...view.preferences, state: { ...view.preferences.state, columnSizing: sizing } } }, getSavedViewSchema(grid))).toThrow(); expect(getter).not.toHaveBeenCalled();
  });
  it("supports special column IDs and rejects view modifications to protected columns", () => {
    const grid = createGrid({ data: [{ id: "a", value: "one" }], columns: [{ id: "__proto__", accessorKey: "value" }], getRowId: (row) => row.id }); grid.setColumnSize("__proto__", 220);
    const view = createSavedGridView(grid, { id: "safe", name: "Safe" }); expect(Object.hasOwn(view.preferences.state.columnSizing, "__proto__")).toBe(true); expect(parseSavedGridView(JSON.stringify(view), getSavedViewSchema(grid))).toEqual(view);
    const other = makeGrid(), protectedView = createSavedGridView(other, { id: "one", name: "One" }); other.toggleColumnVisibility("name", false); const before = other.getState();
    expect(() => applySavedGridView(other, protectedView, { canConfigureColumn: (id) => id !== "name" })).toThrow(/protected/); expect(other.getState()).toBe(before);
  });
  it("rejects partial saved orders that move an omitted protected column without changing state", () => {
    const grid = makeGrid(), saved = createSavedGridView(grid, { id: "order", name: "Order" });
    const view = { ...saved, preferences: { ...saved.preferences, state: { ...saved.preferences.state, columnOrder: ["amount"] } } };
    const before = grid.getState(), listener = vi.fn(); grid.subscribe(listener);
    expect(() => applySavedGridView(grid, view, { canConfigureColumn: (id) => id !== "name" })).toThrow(/protected/);
    expect(grid.getState()).toBe(before); expect(listener).not.toHaveBeenCalled();
    expect(grid.getAllLeafColumns().map((column) => column.id)).toEqual(columns.map((column) => column.accessorKey));
  });
  it("accepts equivalent default and explicit saved orders around a protected column", () => {
    const grid = makeGrid(), saved = createSavedGridView(grid, { id: "order", name: "Order" });
    const explicit = { ...saved, preferences: { ...saved.preferences, state: { ...saved.preferences.state, columnOrder: columns.map((column) => column.accessorKey) } } };
    expect(() => applySavedGridView(grid, explicit, { canConfigureColumn: (id) => id !== "name" })).not.toThrow();
    expect(() => applySavedGridView(grid, saved, { canConfigureColumn: (id) => id !== "name" })).not.toThrow();
    expect(grid.getAllLeafColumns().map((column) => column.id)).toEqual(columns.map((column) => column.accessorKey));
  });
  it("resolves a saved reset against definition order rather than the current partial order", () => {
    const grid = makeGrid(), saved = createSavedGridView(grid, { id: "order", name: "Order" });
    grid.setColumnOrder(["region"]); const before = grid.getState();
    expect(grid.getAllLeafColumns()[0]?.id).toBe("region");
    expect(() => applySavedGridView(grid, saved, { canConfigureColumn: (id) => id !== "name" })).toThrow(/protected/);
    expect(grid.getState()).toBe(before);
  });
  it("resolves grouped and hidden columns while allowing changes that preserve protected positions", () => {
    const grid = makeGrid({ columns: [{ id: "group", columns: [{ accessorKey: "name" }, { accessorKey: "amount" }] }, { accessorKey: "region" }] });
    grid.toggleColumnVisibility("amount", false);
    const saved = createSavedGridView(grid, { id: "order", name: "Order" });
    const changed = { ...saved, preferences: { ...saved.preferences, state: { ...saved.preferences.state, columnOrder: ["region", "name"] } } };
    expect(() => applySavedGridView(grid, changed, { canConfigureColumn: (id) => id !== "amount" })).toThrow(/protected/);
    const allowed = { ...saved, preferences: { ...saved.preferences, state: { ...saved.preferences.state, columnOrder: ["name", "region", "amount"] } } };
    expect(() => applySavedGridView(grid, allowed, { canConfigureColumn: (id) => id !== "name" })).not.toThrow();
    expect(grid.getAllLeafColumns().map((column) => column.id)).toEqual(["name", "region", "amount"]);
  });
  it("persists, reloads, imports and deletes views and reports blocked storage without losing them", () => {
    const storage = memoryStorage(), { grid, controller } = fixture({ storage }); controller.setViewName("Saved"); controller.saveView(); const id = controller.getState().selectedViewId;
    const again = fixture({ storage }); expect(again.controller.getState().views).toHaveLength(1); again.controller.selectView(id); again.controller.exportView(); const json = again.controller.getState().viewJSON;
    again.controller.setViewJSON(json); again.controller.importView(); expect(again.controller.getState().views).toHaveLength(1);
    storage.setItem = () => { throw new Error("Blocked storage"); }; const before = controller.getState().views; controller.setViewName("New name"); expect(() => controller.saveView()).toThrow(/Blocked/); expect(controller.getState().views).toBe(before); expect(controller.getState().error).toMatch(/Blocked/);
    storage.setItem = (key, value) => { storage.values.set(key, value); }; controller.deleteView(); expect(controller.getState().views).toEqual([]); expect(grid.getState().filterExpression).toBeNull();
  });
  it("loads corrupted storage as an error and enforces collection/name/JSON bounds", () => {
    const storage = memoryStorage(); storage.values.set("rowick:saved-views:v1", "bad json"); const { controller } = fixture({ storage, maxViews: 1 }); expect(controller.getState().error).toBeTruthy();
    controller.setViewName("First"); controller.saveView(); controller.selectView(""); controller.setViewName("Second"); expect(() => controller.saveView()).toThrow(/limit/); expect(controller.getState().views).toHaveLength(1);
    expect(() => controller.setViewJSON("x".repeat(262_145))).toThrow(/large/); controller.setViewJSON('{"version":9}'); expect(() => controller.importView()).toThrow(/version/); expect(controller.getState().views).toHaveLength(1);
    controller.clearViews(); expect(controller.getState().views).toEqual([]);
  });
});
