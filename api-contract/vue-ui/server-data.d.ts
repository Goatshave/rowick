import { DefineComponent } from 'vue';
import { AnyColumnDef, GridState } from '@rowick/core';
import { DataSourceController, DataSourceActions, DataSourceLabels, DataChildScope } from '@rowick/data/server-data';

interface ServerDataPanelProps<TRow, TQuery> {
    controller: DataSourceController<TRow, TQuery>;
    columns: readonly AnyColumnDef<TRow>[];
    actions?: DataSourceActions;
    labels?: Partial<DataSourceLabels>;
    getRowLabel?: (row: TRow) => string;
    getChildScope?: (row: TRow) => DataChildScope | undefined;
    gridStyle?: Record<string, string>;
    gridState?: Partial<GridState>;
    onGridStateChange?: (state: GridState) => void;
}
declare function createServerDataPanel<TRow, TQuery>(): DefineComponent<ServerDataPanelProps<TRow, TQuery>>;
declare const ServerDataPanel: DefineComponent<ServerDataPanelProps<unknown, unknown>>;

export { ServerDataPanel, type ServerDataPanelProps, createServerDataPanel };
