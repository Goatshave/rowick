import * as react from 'react';
import { FilterPanelController, FilterPanelLabels, FilterPanelSection } from '@rowick/data/filtering';

interface FilterPanelProps {
    controller: FilterPanelController;
    labels?: Partial<FilterPanelLabels>;
    sections?: readonly FilterPanelSection[];
}
declare function FilterPanel({ controller, labels: overrides, sections }: FilterPanelProps): react.JSX.Element;

export { FilterPanel, type FilterPanelProps };
