import type { GridLayoutController, LayoutCellContext, LayoutDetailContext, LayoutGridLabels } from "@rowick/data/layout";
import type { SvelteComponentTyped } from "svelte";
import type { SvelteDataGridRenderValue } from "./DataGrid.svelte";
export interface LayoutGridProps<TData = unknown> {
  controller: GridLayoutController<TData>; idPrefix: string; height?: number; labels?: Partial<LayoutGridLabels>;
  renderCell?: (context: LayoutCellContext<TData>) => SvelteDataGridRenderValue<LayoutCellContext<TData>>;
  renderDetail?: (context: LayoutDetailContext<TData>) => SvelteDataGridRenderValue<LayoutDetailContext<TData>>;
}
export default class LayoutGrid<TData = unknown> extends SvelteComponentTyped<LayoutGridProps<TData>, Record<string, never>, { cell: { context: LayoutCellContext<TData> }; detail: { context: LayoutDetailContext<TData> } }> {}
