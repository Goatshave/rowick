import type { AnyColumnDef, GridState } from "@rowick/core";
import type { DataChildScope, DataSourceActions, DataSourceController, DataSourceLabels } from "@rowick/data/server-data";
import type { SvelteComponentTyped } from "svelte";
export interface ServerDataPanelProps<TRow = unknown, TQuery = unknown> {
  controller: DataSourceController<TRow, TQuery>; columns: readonly AnyColumnDef<TRow>[];
  actions?: DataSourceActions; labels?: Partial<DataSourceLabels>; getRowLabel?: (row: TRow) => string;
  getChildScope?: (row: TRow) => DataChildScope | undefined; gridStyle?: Record<string, string>;
  gridState?: Partial<GridState>; onGridStateChange?: (state: GridState) => void;
}
export default class ServerDataPanel<TRow = unknown, TQuery = unknown> extends SvelteComponentTyped<ServerDataPanelProps<TRow, TQuery>> {}
