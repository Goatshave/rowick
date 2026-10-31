import { createGrid, type AnyColumnDef } from "@rowick/core";
import { createFilterPanelController } from "@rowick/data/filtering";
import { createGridLayoutController } from "@rowick/data/layout";
import { createDataSourceController } from "@rowick/data/server-data";
import { createAnalyticsController } from "@rowick/data/analytics";
import { createLocaleNumberCodec, createLocaleDateCodec } from "@rowick/data/locale";
import { createXlsxExporter } from "@rowick/export-xlsx";
import { FilterPanel as ReactFilter } from "@rowick/react-ui/filtering";
import { LayoutGrid as ReactLayout } from "@rowick/react-ui/layout";
import { ServerDataPanel as ReactRemote } from "@rowick/react-ui/server-data";
import { AnalyticsPanel as ReactAnalytics } from "@rowick/react-ui/analytics";
import { createLayoutGrid } from "@rowick/vue-ui/layout";
import { createServerDataPanel } from "@rowick/vue-ui/server-data";
import { createAnalyticsPanel } from "@rowick/vue-ui/analytics";
import type { FilterPanelProps } from "@rowick/svelte-ui/filtering";
import type { LayoutGridProps } from "@rowick/svelte-ui/layout";
import type { ServerDataPanelProps } from "@rowick/svelte-ui/server-data";
import type { AnalyticsPanelProps } from "@rowick/svelte-ui/analytics";
interface Row { id: string; name: string; amount: number }
const rows: Row[] = [{ id: "a", name: "Installed", amount: 1 }];
const columns: AnyColumnDef<Row>[] = [{ accessorKey: "name" }, { accessorKey: "amount", filterValueType: "number" }];
const grid = createGrid({ data: rows, columns, getRowId: (row) => row.id });
const filter = createFilterPanelController({ grid }); const layout = createGridLayoutController(grid);
const remote = createDataSourceController<Row, { status: string }>({ query: { status: "all" }, getRowId: (row) => row.id,
  source: { getRows: async (request) => ({ queryId: request.queryId, rows, total: { kind: "exact", count: 1 }, revision: 1, hasNext: false }) } });
const analytics = createAnalyticsController<Row>({ fields: [{ id: "name", label: "Name", getValue: (row) => row.name }], getRows: () => rows,
  configuration: { version: 1, rowAxes: ["name"], columnAxes: [], metrics: [{ id: "count", label: "Count", operation: "count" }] }, exporters: { xlsx: createXlsxExporter() } });
export const react = <><ReactFilter controller={filter} /><ReactLayout controller={layout} /><ReactRemote controller={remote} columns={columns} /><ReactAnalytics controller={analytics} /></>;
export const vue = [createLayoutGrid<Row>(), createServerDataPanel<Row, { status: string }>(), createAnalyticsPanel<Row>()];
export const svelte: [FilterPanelProps, LayoutGridProps<Row>, ServerDataPanelProps<Row, { status: string }>, AnalyticsPanelProps<Row>] = [
  { controller: filter, idPrefix: "filter" }, { controller: layout, idPrefix: "layout" }, { controller: remote, columns }, { controller: analytics },
];
export const codecs = [createLocaleNumberCodec({ locale: "ar-EG", valueType: "decimal" }), createLocaleDateCodec({ locale: "ja-JP" })];
