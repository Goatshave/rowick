import * as react from 'react';
import { RowEditingForm, EditingLabels } from '@rowick/data/editing';

interface RowEditingPanelProps<TData> {
    form: RowEditingForm<TData>;
    labels?: Partial<EditingLabels>;
}
declare function RowEditingPanel<TData>({ form, labels: overrides }: RowEditingPanelProps<TData>): react.JSX.Element;

export { RowEditingPanel, type RowEditingPanelProps };
