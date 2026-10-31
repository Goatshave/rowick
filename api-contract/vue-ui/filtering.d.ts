import { DefineComponent } from 'vue';
import { FilterPanelController, FilterPanelLabels, FilterPanelSection } from '@rowick/data/filtering';

interface FilterPanelProps {
    controller: FilterPanelController;
    idPrefix: string;
    labels?: Partial<FilterPanelLabels>;
    sections?: readonly FilterPanelSection[];
}
declare const FilterPanel: DefineComponent<FilterPanelProps>;

export { FilterPanel, type FilterPanelProps };
