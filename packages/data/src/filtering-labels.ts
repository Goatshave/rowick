import type { FilterNode, FilterOperator } from "@rowick/core";
import type { FilterPanelState } from "./filtering";
export type FilterPanelSection = "filters" | "columns" | "facets" | "views";
export interface FilterPanelLabels {
  panel: string; filters: string; columns: string; facets: string; views: string;
  apply: string; reset: string; reload: string; addCondition: string; addGroup: string; remove: string;
  group: (path: string) => string; condition: (path: string) => string; groupOperator: string; all: string; any: string;
  column: string; operator: string; value: string; upperValue: string; missing: string; caseSensitive: string; listHint: string;
  active: (count: number) => string; stale: string; visible: string; pin: string; width: string; unpinned: string; left: string; right: string; moveBefore: string; moveAfter: string;
  columnSearch: string; limitedColumns: (shown: number, total: number) => string;
  facetColumn: string; facetSearch: string; loading: string; retry: string; facetScope: (scope: string) => string; facetCount: (value: string, count: number) => string; truncated: string;
  missingValue: string; range: (minimum: string, maximum: string) => string; partialCounts: string;
  viewName: string; chooseView: string; saveView: string; restoreView: string; deleteView: string; clearViews: string; exportView: string; importView: string; viewJSON: string;
  describeOperator: (operator: FilterOperator) => string;
}
const operatorLabels: Record<FilterOperator, string> = { eq: "equals", neq: "does not equal", contains: "contains", "not-contains": "does not contain", "starts-with": "starts with", "ends-with": "ends with",
  gt: "greater than", gte: "greater than or equal", lt: "less than", lte: "less than or equal", between: "between", in: "is in", "not-in": "is not in", "is-empty": "is empty", "is-not-empty": "is not empty" };
export const defaultFilterPanelLabels: FilterPanelLabels = Object.freeze({
  panel: "Grid filters and settings", filters: "Advanced filters", columns: "Columns", facets: "Filter candidates", views: "Saved views",
  apply: "Apply filters", reset: "Reset filters", reload: "Reload filters", addCondition: "Add condition", addGroup: "Add group", remove: "Remove",
  group: (path: string) => `Filter group ${path}`, condition: (path: string) => `Condition ${path}`, groupOperator: "Match", all: "All conditions (AND)", any: "Any condition (OR)",
  column: "Column", operator: "Operator", value: "Value", upperValue: "Upper value", missing: "Match missing value", caseSensitive: "Case sensitive", listHint: 'Enter a JSON array, for example ["A","B"], [1,2], or [true,null].',
  active: (count: number) => `${count} active filter conditions`, stale: "Filters changed elsewhere. Reload before applying this draft.",
  visible: "visible", pin: "pin", width: "width", unpinned: "Not pinned", left: "Left", right: "Right", moveBefore: "Move before", moveAfter: "Move after",
  columnSearch: "Find column", limitedColumns: (shown: number, total: number) => `Showing ${shown} of ${total} columns. Search to find more.`,
  facetColumn: "Candidate column", facetSearch: "Search candidates", loading: "Loading candidates", retry: "Retry candidates", facetScope: (scope: string) => scope === "loaded" ? "Counts describe loaded rows only." : scope === "server" ? "Candidates are provided by the server." : "Counts describe matching client rows with this column's conditions removed.",
  facetCount: (value: string, count: number) => `${value} (${count})`, truncated: "Candidate results are limited. Refine the search.",
  missingValue: "Missing", range: (minimum: string, maximum: string) => `Min: ${minimum} · Max: ${maximum}`, partialCounts: "Only scanned rows contribute to these counts and ranges. Use server candidates for the complete dataset.",
  viewName: "View name", chooseView: "Choose view", saveView: "Save view", restoreView: "Restore view", deleteView: "Delete view", clearViews: "Clear saved views", exportView: "Export view", importView: "Import view", viewJSON: "View JSON",
  describeOperator: (operator: FilterOperator) => operatorLabels[operator],
});
export function describeActiveFilters(state: FilterPanelState, labels: FilterPanelLabels = defaultFilterPanelLabels): string {
  const describe = (node: FilterNode): string => node.kind === "group" ? `(${node.children.map(describe).join(node.operator === "and" ? " AND " : " OR ")})` :
    `${state.columns.find((column) => column.id === node.columnId)?.label ?? node.columnId} ${labels.describeOperator(node.operator)}${Object.hasOwn(node, "value") ? " " + JSON.stringify(node.value) : ""}`;
  return state.activeExpression?.root ? describe(state.activeExpression.root) : "";
}
