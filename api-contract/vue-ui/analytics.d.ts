import { DefineComponent } from 'vue';
import { AnalyticsController, AnalyticsLabels } from '@rowick/data/analytics';

interface AnalyticsPanelProps<TData> {
    controller: AnalyticsController<TData>;
    labels?: Partial<AnalyticsLabels>;
}
declare function createAnalyticsPanel<TData>(): DefineComponent<AnalyticsPanelProps<TData>>;
declare const AnalyticsPanel: DefineComponent<AnalyticsPanelProps<unknown>>;

export { AnalyticsPanel, type AnalyticsPanelProps, createAnalyticsPanel };
