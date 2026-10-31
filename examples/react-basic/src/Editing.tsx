import { useEffect, useState } from "react";
import { DataGrid } from "@rowick/react-ui";
import { RowEditingPanel } from "@rowick/react-ui/editing";
import "@rowick/react-ui/editing.css";
import { createRowEditingExample, editingColumns, type RowEditingExample } from "@rowick/example-shared-server/row-editing-client";
export default function Editing() {
  const [session, setSession] = useState<RowEditingExample>(), [, redraw] = useState(0);
  useEffect(() => { const source = createRowEditingExample(), stop = source.subscribe(() => redraw((value) => value + 1)); setSession(source);
    return () => { stop(); source.dispose(); }; }, []);
  if (!session) return <main><h1>Row editing</h1></main>;
  const actions = [["Edit a", () => session.begin("a")], ["Edit b", () => session.begin("b")], ["Hold saves", session.hold], ["Release saves", session.release],
    ["Fail next save for b", session.failNext], ["External update a", session.externalUpdate], ["Change query", session.changeQuery], ["Paste two rows", session.paste], ["Fill amounts", session.fill]] as const;
  return <main style={{ padding: 24, overflowWrap: "anywhere" }}><h1>Row editing</h1><p>Drafts, asynchronous validation, serialized saves and recovery.</p>
    <div role="group" aria-label="Editing scenarios">{actions.map(([label, action]) => <button type="button" key={label} onClick={action}>{label}</button>)}</div>
    <DataGrid ariaLabel="Draft records" data={session.getProjectedRows()} columns={editingColumns} getRowId={(row) => row.id} style={{ height: "240px" }} />
    <output aria-label="Accepted data">{JSON.stringify(session.getRows())}</output>
    <RowEditingPanel form={session.form} />
  </main>;
}
