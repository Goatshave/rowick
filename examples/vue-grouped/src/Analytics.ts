import { defineComponent, h, onBeforeUnmount } from "vue";
import { createAnalyticsPanel } from "@rowick/vue-ui/analytics";
import "@rowick/vue-ui/analytics.css";
import { createAnalyticsExample, downloadAnalyticsArtifact, type AnalyticsRecord } from "@rowick/example-shared-server/analytics-client";
const Panel = createAnalyticsPanel<AnalyticsRecord>();
export default defineComponent({ setup() {
  const example = createAnalyticsExample({ onArtifact: downloadAnalyticsArtifact, loadView: () => localStorage.getItem("rowick-analytics"), saveView: (value) => localStorage.setItem("rowick-analytics", value) }); onBeforeUnmount(example.dispose);
  const actions = [["Filter KR", example.filterKR], ["Show all records", example.showAll], ["Try column limit", example.overflow], ["Fail view storage", example.failStorage], ["Corrupt saved view", example.corruptView], ["Fail next custom export", example.failNextExport]] as const;
  return () => h("main", { style: { padding: "24px" } }, [h("h1", "Pivot and export"), h("p", "Bounded analytical results, typed files, printing and recoverable export jobs."),
    h("div", { role: "group", "aria-label": "Analytics scenarios" }, actions.map(([label, action]) => h("button", { type: "button", onClick: action }, label))), h(Panel, { controller: example.controller }),
  ]);
} });
