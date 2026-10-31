import * as react from 'react';
import { CSSProperties } from 'react';
import { AnyColumnDef, GridState } from '@rowick/core';
import { DataSourceController, DataSourceActions, DataSourceLabels, DataChildScope } from '@rowick/data/server-data';

interface ServerDataPanelProps<TRow, TQuery> {
    controller: DataSourceController<TRow, TQuery>;
    columns: readonly AnyColumnDef<TRow>[];
    actions?: DataSourceActions;
    labels?: Partial<DataSourceLabels>;
    getRowLabel?: (row: TRow) => string;
    getChildScope?: (row: TRow) => DataChildScope | undefined;
    gridStyle?: CSSProperties;
    gridState?: Partial<GridState>;
    onGridStateChange?: (state: GridState) => void;
}
declare function ServerDataPanel<TRow, TQuery>({ controller, columns, actions, labels: overrides, getRowLabel, getChildScope, gridStyle, gridState, onGridStateChange }: ServerDataPanelProps<TRow, TQuery>): react.JSX.Element;

export { ServerDataPanel, type ServerDataPanelProps };
