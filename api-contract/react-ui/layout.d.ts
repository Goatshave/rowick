import * as react from 'react';
import { ReactNode } from 'react';
import { GridLayoutController, LayoutGridLabels, LayoutCellContext, LayoutDetailContext } from '@rowick/data/layout';

interface LayoutGridProps<TData> {
    controller: GridLayoutController<TData>;
    idPrefix?: string;
    height?: number;
    labels?: Partial<LayoutGridLabels>;
    renderCell?: (context: LayoutCellContext<TData>) => ReactNode;
    renderDetail?: (context: LayoutDetailContext<TData>) => ReactNode;
}
declare function LayoutGrid<TData>({ controller, idPrefix, height, labels: overrides, renderCell, renderDetail }: LayoutGridProps<TData>): react.JSX.Element;

export { LayoutGrid, type LayoutGridProps };
