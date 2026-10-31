import { useEffect, useState } from "react";
import { LayoutGrid } from "@rowick/react-ui/layout";
import { RowEditingPanel } from "@rowick/react-ui/editing";
import "@rowick/react-ui/layout.css";
import "@rowick/react-ui/editing.css";
import { createLayoutExample, downloadLayoutArtifact, installLayoutTestBridge, type LayoutExample } from "@rowick/example-shared-server/layout-client";
export default function Layout() {
  const [source, setSource] = useState<LayoutExample>(), [, redraw] = useState(0), [visible, setVisible] = useState(true), [error, setError] = useState<string>();
  useEffect(() => { const session = createLayoutExample(new URLSearchParams(location.search).get("dir") === "rtl" ? "rtl" : "ltr"), stop = session.subscribe(() => redraw((value) => value + 1)), cleanup = installLayoutTestBridge(session, setVisible); setSource(session); return () => { cleanup(); stop(); session.dispose(); }; }, []);
  const run = async (action: () => unknown) => { setError(undefined); try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Action failed"); } };
  if (!source) return <main><h1>Advanced layout</h1></main>;
  return <main style={{ padding: 24 }}><h1>Advanced layout</h1><p>10,000 records × 20 columns. Stable IDs, variable heights, interactive details, pinned rows and columns, native merges and draft history. Direction: {source.direction}.</p>
    <div role="group" aria-label="Layout scenarios">{source.actions.map(([label, action]) => <button key={label} type="button" onClick={() => void run(action)}>{label}</button>)}
      <button onClick={() => void run(async () => downloadLayoutArtifact(await source.export("csv")))}>Export selected CSV</button><button onClick={() => void run(async () => downloadLayoutArtifact(await source.export("xlsx")))}>Export selected XLSX</button><button onClick={() => void run(async () => downloadLayoutArtifact(await source.export("csv", "page")))}>Export page CSV</button></div>
    {error && <p role="alert">{error}</p>}{visible && <LayoutGrid controller={source.layout} idPrefix="example-layout" height={440} renderDetail={({ row }) => <fieldset><legend>Details for {row.id}</legend><label>Detail note {row.id}<input aria-label={`Detail note ${row.id}`} value={source.getNote(row.id)} onChange={(event) => source.setNote(row.id, event.target.value)} /></label><button onClick={() => source.toggleExpanded(row.id)}>{source.getExpanded(row.id) ? "Shrink detail" : "Grow detail"}</button><p>{Array.from({ length: source.getExpanded(row.id) ? 14 : 1 }, (_, index) => <span style={{ display: "block" }} key={index}>Interactive detail line {index + 1}</span>)}</p></fieldset>} />}
    <output aria-label="Draft first rows">{JSON.stringify(source.getSummary())}</output><output aria-label="Accepted row order">{source.getRows().slice(0, 5).map((row) => row.id).join(",")}</output><RowEditingPanel form={source.form} />
  </main>;
}
