import { useEffect, useState } from "react";
import { AnalyticsPanel } from "@rowick/react-ui/analytics";
import "@rowick/react-ui/analytics.css";
import { createAnalyticsExample, downloadAnalyticsArtifact, type AnalyticsExample } from "@rowick/example-shared-server/analytics-client";
export default function Analytics() {
  const [example, setExample] = useState<AnalyticsExample>();
  useEffect(() => { const source = createAnalyticsExample({ onArtifact: downloadAnalyticsArtifact, loadView: () => localStorage.getItem("rowick-analytics"), saveView: (value) => localStorage.setItem("rowick-analytics", value) }); setExample(source); return source.dispose; }, []);
  if (!example) return <main style={{ padding: 24 }}><h1>Pivot and export</h1></main>;
  const actions = [["Filter KR", example.filterKR], ["Show all records", example.showAll], ["Try column limit", example.overflow], ["Fail view storage", example.failStorage], ["Corrupt saved view", example.corruptView], ["Fail next custom export", example.failNextExport]] as const;
  return <main style={{ padding: 24 }}><h1>Pivot and export</h1><p>Bounded analytical results, typed files, printing and recoverable export jobs.</p>
    <div role="group" aria-label="Analytics scenarios">{actions.map(([label, action]) => <button type="button" key={label} onClick={action}>{label}</button>)}</div><AnalyticsPanel controller={example.controller} /></main>;
}
