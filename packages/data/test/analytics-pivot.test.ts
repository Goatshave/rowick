import { describe, expect, it, vi } from "vitest";
import { createPivot, parsePivotConfiguration, serializePivotConfiguration, validatePivotConfiguration, type PivotConfiguration, type PivotField, type PivotOperation } from "../src/analytics-pivot";
interface Sale { region: string | null; city: string; quarter: string; amount: number | null; owner: string; }
const rows: Sale[] = [{ region: "KR", city: "Seoul", quarter: "Q1", amount: 10, owner: "Kim" }, { region: "KR", city: "Seoul", quarter: "Q2", amount: 20, owner: "Kim" },
  { region: "KR", city: "Busan", quarter: "Q1", amount: 5, owner: "Lee" }, { region: "JP", city: "Tokyo", quarter: "Q1", amount: 7, owner: "Sato" }, { region: null, city: "Unknown", quarter: "Q1", amount: null, owner: "Lee" }];
const fields: readonly PivotField<Sale>[] = ["region", "city", "quarter", "amount", "owner"].map((id) => ({ id, label: id, getValue: (row) => row[id as keyof Sale] }));
const config: PivotConfiguration = { version: 1, rowAxes: ["region", "city"], columnAxes: ["quarter"], metrics: [{ id: "sales", label: "Sales", columnId: "amount", operation: "sum" }], subtotals: true, rowTotals: true };
const cell = (result: ReturnType<typeof createPivot<Sale>>, rowValues: unknown[], columnValues: unknown[], metric = "sales", total = false) => result.rows.find((row) => JSON.stringify(row.values) === JSON.stringify(rowValues))?.cells[result.columns.find((column) => column.metric.id === metric && column.total === total && JSON.stringify(column.values) === JSON.stringify(columnValues))!.id];
describe("bounded typed pivot", () => {
  it("builds row/column axes, detail groups, subtotals and grand/row totals", () => {
    const result = createPivot(rows, fields, config);
    expect(result.inputRows).toBe(5); expect(result.columns.map((column) => column.headers)).toEqual([["Q1", "Sales"], ["Q2", "Sales"], ["Total", "Sales"]]);
    expect(cell(result, ["KR", "Seoul"], ["Q1"])).toBe(10); expect(cell(result, ["KR", "Seoul"], [], "sales", true)).toBe(30);
    expect(cell(result, ["KR"], ["Q1"])).toBe(15); expect(cell(result, [], [], "sales", true)).toBe(42);
    expect(cell(result, [null, "Unknown"], ["Q1"])).toBeNull();
    expect(result.rows.filter((row) => row.values[0] === "KR").map((row) => row.kind)).toEqual(["data", "data", "subtotal"]);
    expect(result.rows.at(-1)).toBe(result.grandTotal); expect(Object.getPrototypeOf(result.grandTotal.cells)).toBeNull();
  });
  it.each([["sum", 35], ["avg", 35 / 3], ["min", 5], ["max", 20], ["count", 3], ["distinct-count", 3]] as const)("aggregates %s with null skipping", (operation, expected) => {
    const result = createPivot(rows.filter((row) => row.region === "KR"), fields, { version: 1, rowAxes: [], columnAxes: [], metrics: [{ id: "m", label: "Metric", columnId: "amount", operation }] });
    expect(result.rows).toHaveLength(1); expect(result.grandTotal.cells[result.columns[0]!.id]).toBe(expected);
  });
  it("counts rows including null, but distinct values exclude null", () => {
    const result = createPivot(rows, fields, { version: 1, rowAxes: [], columnAxes: [], metrics: [{ id: "count", label: "Count", operation: "count" }, { id: "owners", label: "Owners", columnId: "owner", operation: "distinct-count" }] });
    expect(result.grandTotal.cells[result.columns[0]!.id]).toBe(5); expect(result.grandTotal.cells[result.columns[1]!.id]).toBe(3);
  });
  it("keeps scalar types and delimiter-shaped values distinct in dynamic IDs", () => {
    const data = [{ axis: 1 }, { axis: "1" }, { axis: true }, { axis: "true" }, { axis: "__proto__" }, { axis: null }];
    const result = createPivot(data, [{ id: "axis", label: "Axis", getValue: (row) => row.axis }], { version: 1, rowAxes: ["axis"], columnAxes: [], metrics: [{ id: "__proto__", label: "Count", operation: "count" }] });
    expect(result.rows).toHaveLength(7); expect(new Set(result.rows.map((row) => row.id)).size).toBe(7); expect(result.grandTotal.cells[result.columns[0]!.id]).toBe(6);
  });
  it("sorts grouped row and dynamic column axes deterministically", () => {
    const result = createPivot(rows, fields, { ...config, sort: [{ axis: "rows", index: 0, desc: true }, { axis: "columns", index: 0, desc: true }] });
    expect(result.rows[0]?.values[0]).toBe("KR"); expect(result.columns[0]?.values).toEqual(["Q2"]);
  });
  it("handles empty input and no axes without fabricating data records", () => {
    const result = createPivot([], fields, { ...config, rowAxes: [], columnAxes: [], metrics: [{ id: "count", label: "Count", operation: "count" }] });
    expect(result.rows).toHaveLength(1); expect(result.inputRows).toBe(0); expect(result.grandTotal.cells[result.columns[0]!.id]).toBe(0);
  });
  it("consumes an iterator once and retains no input rows", () => {
    const read = vi.fn(function* () { yield* rows; }); const iterable = { [Symbol.iterator]: read }, result = createPivot(iterable, fields, config);
    expect(read).toHaveBeenCalledTimes(1); rows[0]!.amount = 999; expect(cell(result, ["KR", "Seoul"], ["Q1"])).toBe(10); rows[0]!.amount = 10;
  });
  it.each([{ maxInputRows: 2 }, { maxRows: 2 }, { maxColumns: 1 }, { maxCells: 2 }, { maxGroups: 1 }, { maxDistinctPerCell: 1 }, { maxDistinctValues: 1 }, { maxKeyCharacters: 5 }])("rejects a limit overflow atomically %#", (limits) => {
    const metrics = limits.maxDistinctPerCell || limits.maxDistinctValues ? [{ id: "m", label: "Distinct", columnId: "owner", operation: "distinct-count" as PivotOperation }] : config.metrics;
    expect(() => createPivot(rows, fields, { ...config, metrics }, limits)).toThrow(RangeError);
  });
  it("does not coerce text/Date/object or non-finite values into numeric pivot values", () => {
    for (const value of ["10", new Date(), {}, NaN, Infinity]) {
      expect(() => createPivot([{ value }], [{ id: "value", label: "Value", getValue: (row) => row.value }], { version: 1, rowAxes: [], columnAxes: [], metrics: [{ id: "sum", label: "Sum", operation: "sum", columnId: "value" }] })).toThrow();
    }
    expect(() => createPivot([{ value: 1e308 }, { value: 1e308 }], [{ id: "value", label: "Value", getValue: (row) => row.value }], { version: 1, rowAxes: [], columnAxes: [], metrics: [{ id: "sum", label: "Sum", operation: "sum", columnId: "value" }] })).toThrow(/finite/);
  });
  it("roundtrips a versioned immutable configuration and rejects schema changes", () => {
    const parsed = parsePivotConfiguration(serializePivotConfiguration(config, fields), fields); expect(parsed).toEqual(config); expect(Object.isFrozen(parsed.metrics[0])).toBe(true);
    expect(() => parsePivotConfiguration(serializePivotConfiguration(config, fields), fields.filter((field) => field.id !== "quarter"))).toThrow(/axis/);
  });
  it.each([{ ...config, version: 2 }, { ...config, rowAxes: ["region", "region"] }, { ...config, columnAxes: ["region"] }, { ...config, metrics: [] },
    { ...config, metrics: [{ id: "x", label: "X", operation: "custom" }] }, { ...config, sort: [{ axis: "rows", index: 9 }] }, { ...config, extra: true }, { ...config, rowAxes: new Array(1) }])("rejects invalid configuration %#", (input) => expect(() => validatePivotConfiguration(input, fields)).toThrow());
});
