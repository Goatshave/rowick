import type { FilterPanelController, FilterPanelLabels, FilterPanelSection } from "@rowick/data/filtering";
import type { SvelteComponentTyped } from "svelte";
export interface FilterPanelProps { controller: FilterPanelController; idPrefix: string; labels?: Partial<FilterPanelLabels>; sections?: readonly FilterPanelSection[]; }
export default class FilterPanel extends SvelteComponentTyped<FilterPanelProps> {}
