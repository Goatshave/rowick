import * as react from 'react';
import { AnalyticsController, AnalyticsLabels } from '@rowick/data/analytics';

interface AnalyticsPanelProps<TData> {
    controller: AnalyticsController<TData>;
    labels?: Partial<AnalyticsLabels>;
}
declare function AnalyticsPanel<TData>({ controller, labels: overrides }: AnalyticsPanelProps<TData>): react.JSX.Element;

export { AnalyticsPanel, type AnalyticsPanelProps };
