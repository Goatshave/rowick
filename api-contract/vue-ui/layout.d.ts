import { DefineComponent, VNodeChild } from 'vue';
import { GridLayoutController, LayoutGridLabels, LayoutCellContext, LayoutDetailContext } from '@rowick/data/layout';

interface LayoutGridProps<TData> {
    controller: GridLayoutController<TData>;
    idPrefix: string;
    height?: number;
    labels?: Partial<LayoutGridLabels>;
    renderCell?: (context: LayoutCellContext<TData>) => VNodeChild;
    renderDetail?: (context: LayoutDetailContext<TData>) => VNodeChild;
}
declare function createLayoutGrid<TData>(): DefineComponent<LayoutGridProps<TData>>;
declare const LayoutGrid: DefineComponent<LayoutGridProps<unknown>>;

export { LayoutGrid, type LayoutGridProps, createLayoutGrid };
