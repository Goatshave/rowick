import { describe, expect, it } from "vitest";
import { createGrid, type AnyColumnDef } from "@rowick/core";
import { getRemoteDataColumns } from "../src/datasource-columns";
describe("remote panel column guards", () => {
  it("disables subset query controls and editing without mutating product definitions", () => {
    const columns = [{ accessorKey: "value" as const, enableEditing: true, enableSorting: true, enableFiltering: true, enableGrouping: true }];
    const resolved = getRemoteDataColumns(columns, false), grid = createGrid({ columns: resolved, data: [{ value: 2 }, { value: 1 }] });
    expect(resolved[0]).toMatchObject({ enableEditing: false, enableSorting: false, enableFiltering: false, enableGlobalFiltering: false, enableGrouping: false });
    expect(grid.getAllLeafColumns()[0]?.getCanSort()).toBe(false); expect(columns[0]?.enableSorting).toBe(true); expect(columns[0]?.enableEditing).toBe(true);
    expect(getRemoteDataColumns(columns, false)).toBe(resolved);
  });
  it("permits declared server query controls only when an owner callback is connected", () => {
    const columns = [{ accessorKey: "value" as const, enableEditing: true }], readonly = getRemoteDataColumns(columns, false), remote = getRemoteDataColumns(columns, true);
    expect(remote).not.toBe(readonly); expect(remote[0]?.enableSorting).toBeUndefined(); expect(remote[0]?.enableEditing).toBe(false); expect(getRemoteDataColumns(columns, true)).toBe(remote);
  });
  it("preserves nested schemas and rejects cycles before creating recursive render state", () => {
    const columns: AnyColumnDef<{ value: number }>[] = [{ id: "group", columns: [{ accessorKey: "value", enableEditing: true }] }];
    const resolved = getRemoteDataColumns(columns, false); expect(resolved[0]?.columns?.[0]).toMatchObject({ accessorKey: "value", enableSorting: false, enableEditing: false });
    const cyclic: AnyColumnDef<{ value: number }>[] = []; cyclic.push({ id: "cycle", columns: cyclic }); expect(() => getRemoteDataColumns(cyclic, false)).toThrow(/hierarchy/);
  });
});
