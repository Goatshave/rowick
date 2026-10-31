import type { AnyColumnDef, Grid } from "@rowick/core";
import { calculateFacets, createFilterPanelController, type FacetSearchRequest } from "@rowick/data/filtering";
export interface FilterRecord { id: string; name: string; region: string; amount: number; money: string; date: string; active: boolean; }
export const filterRecords: readonly FilterRecord[] = [
  { id: "a", name: "Alpha", region: "Seoul", amount: 10, money: "9007199254740993.12", date: "2026-10-01", active: true },
  { id: "b", name: "Beta", region: "Seoul", amount: 20, money: "9007199254740994.12", date: "2026-10-02", active: false },
  { id: "c", name: "Gamma", region: "Tokyo", amount: 30, money: "9007199254740995.12", date: "2026-10-03", active: true },
];
export const filteringColumns: AnyColumnDef<FilterRecord>[] = [
  { accessorKey: "name", header: "Name", filterValueType: "text" }, { accessorKey: "region", header: "Region", filterValueType: "text" },
  { accessorKey: "amount", header: "Amount", filterValueType: "number" }, { accessorKey: "money", header: "Money", filterValueType: "decimal" },
  { accessorKey: "date", header: "Date", filterValueType: "date" }, { accessorKey: "active", header: "Active", filterValueType: "boolean" },
];
export function createFilteringExample(grid: Grid<FilterRecord>, options: { remoteCandidates?: boolean } = {}) {
  let unavailableStorage = false, failNextSearch = false;
  const storage = {
    getItem: (key: string) => globalThis.localStorage.getItem(key),
    setItem: (key: string, value: string) => { if (unavailableStorage) throw new Error("Storage is unavailable"); globalThis.localStorage.setItem(key, value); },
    removeItem: (key: string) => { if (unavailableStorage) throw new Error("Storage is unavailable"); globalThis.localStorage.removeItem(key); },
  };
  const search = async (request: FacetSearchRequest) => {
    await new Promise<void>((resolve, reject) => {
      if (request.signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
      const cancel = () => { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reject(new DOMException("Cancelled", "AbortError")); };
      const timer = setTimeout(() => { request.signal.removeEventListener("abort", cancel); resolve(); }, request.query === "slow" ? 180 : 30);
      request.signal.addEventListener("abort", cancel, { once: true });
    });
    if (failNextSearch) { failNextSearch = false; throw new Error("Candidate service is unavailable"); }
    const result = calculateFacets(filterRecords, grid.getFilterColumnPolicies(), request.columnId, (row, id) => row[id as keyof FilterRecord], { expression: request.expression, maxValues: request.limit, query: request.query });
    return { values: result.values, truncated: result.truncated };
  };
  const controller = createFilterPanelController({ grid, storage, storageKey: "rowick:filtering-example:v1", ...(options.remoteCandidates ? { facetSearch: search } : {}),
    getContextKey: () => JSON.stringify([grid.getState().globalFilter, grid.getState().columnFilters, grid.getState().filterExpression]) });
  return { controller, failStorage: () => { unavailableStorage = true; }, restoreStorage: () => { unavailableStorage = false; }, failCandidates: () => { failNextSearch = true; }, dispose: controller.dispose };
}
