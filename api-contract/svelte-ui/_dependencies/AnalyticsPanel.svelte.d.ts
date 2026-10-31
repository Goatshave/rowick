import type { AnalyticsController, AnalyticsLabels } from "@rowick/data/analytics";
import type { SvelteComponentTyped } from "svelte";
export interface AnalyticsPanelProps<TData = unknown> { controller: AnalyticsController<TData>; labels?: Partial<AnalyticsLabels>; }
export default class AnalyticsPanel<TData = unknown> extends SvelteComponentTyped<AnalyticsPanelProps<TData>> {}
