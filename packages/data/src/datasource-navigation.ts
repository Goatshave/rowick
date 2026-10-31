import type { CachedDataBlock, DataBlockRequest, DataSourceState, DataTotal } from "./datasource";
export function getActiveDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): CachedDataBlock<TRow> | undefined {
  if (!state.activeBlock) return undefined;
  const key = JSON.stringify(state.activeBlock); return state.blocks.find((block) => block.key === key);
}
export function getDataBlockTotal<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataTotal {
  return state.activeBlock?.scope ? getActiveDataBlock(state)?.total ?? { kind: "unknown" } : state.total;
}
export function getNextDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null {
  const request = state.activeBlock, block = getActiveDataBlock(state);
  if (!request || !block?.hasNext) return null;
  if (request.mode === "cursor") return typeof block.nextCursor === "string" ? { ...request, cursor: block.nextCursor } : null;
  return request.mode === "page" ? { ...request, pageIndex: request.pageIndex + 1 } : { ...request, offset: request.offset + request.limit };
}
export function getPreviousDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null {
  const request = state.activeBlock, block = getActiveDataBlock(state);
  if (!request) return null;
  if (request.mode === "cursor") return block && Object.hasOwn(block, "previousCursor") ? { ...request, cursor: block.previousCursor ?? null } : null;
  return request.mode === "page" ? request.pageIndex ? { ...request, pageIndex: request.pageIndex - 1 } : null : request.offset ? { ...request, offset: Math.max(0, request.offset - request.limit) } : null;
}
export function getFirstDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null {
  const request = state.activeBlock; if (!request) return null;
  return request.mode === "cursor" ? { ...request, cursor: null } : request.mode === "page" ? { ...request, pageIndex: 0 } : { ...request, offset: 0 };
}
export function getLastDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null {
  const request = state.activeBlock, total = getDataBlockTotal(state); if (!request || request.mode === "cursor" || total.kind !== "exact") return null;
  const page = Math.max(0, Math.ceil(total.count / request.limit) - 1);
  return request.mode === "page" ? { ...request, pageIndex: page } : { ...request, offset: page * request.limit };
}
export function getRootDataBlock<TRow, TQuery>(state: DataSourceState<TRow, TQuery>): DataBlockRequest | null {
  const request = getFirstDataBlock(state); if (!request) return null;
  const { scope: _scope, ...root } = request; return root;
}
export interface DataSourceLabels {
  panel: string; grid: string; first: string; previous: string; next: string; last: string; refresh: string; retry: string;
  cancel: string; root: string; selectAll: string; clearSelection: string; bulk: string; export: string; retryAction: string;
  stale: string; loading: string; unknownTotal: string; children: (label: string) => string;
  summary: (loaded: number, cached: number, blocks: number, total: DataTotal) => string;
  selection: (mode: "explicit" | "all-matching", count: number) => string;
  submittedSelection: (mode: "explicit" | "all-matching", count: number) => string;
}
export const defaultDataSourceLabels: DataSourceLabels = Object.freeze({
  panel: "Server data", grid: "Remote records", first: "First block", previous: "Previous block", next: "Next block", last: "Last block", refresh: "Refresh data", retry: "Retry read",
  cancel: "Cancel requests", root: "Root rows", selectAll: "Select all matching", clearSelection: "Clear remote selection", bulk: "Apply to selection", export: "Export selection", retryAction: "Retry operation",
  stale: "Data changed; refresh required", loading: "Loading remote data", unknownTotal: "Unknown total",
  children: (label: string) => `Load children of ${label}`,
  summary: (loaded: number, cached: number, blocks: number, total: DataTotal) => `${loaded} loaded rows, ${cached} cached rows in ${blocks} blocks; ${total.kind === "exact" ? `${total.count} total rows` : "unknown total"}`,
  selection: (mode: "explicit" | "all-matching", count: number) => mode === "explicit" ? `${count} selected IDs` : `All matching rows selected, ${count} exclusions`,
  submittedSelection: (mode: "explicit" | "all-matching", count: number) => mode === "explicit" ? `Submitted operation: ${count} selected IDs; retry keeps this selection` : `Submitted operation: all query rows with ${count} exclusions; retry keeps this selection`,
});
