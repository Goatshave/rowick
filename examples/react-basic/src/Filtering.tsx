import { useEffect, useState } from "react";
import { DataGrid } from "@rowick/react-ui";
import { FilterPanel } from "@rowick/react-ui/filtering";
import "@rowick/react-ui/filtering.css";
import type { Grid } from "@rowick/core";
import { createFilteringExample, filterRecords, filteringColumns, type FilterRecord } from "@rowick/example-shared-server/filtering-client";
type Session = ReturnType<typeof createFilteringExample>;
const getRowId = (row: FilterRecord) => row.id;
export default function Filtering() {
  const [grid, setGrid] = useState<Grid<FilterRecord>>(), [session, setSession] = useState<Session>(), [, redraw] = useState(0);
  useEffect(() => {
    if (!grid) return; const owner = createFilteringExample(grid, { remoteCandidates: new URLSearchParams(location.search).has("remote") });
    const stop = grid.subscribe(() => redraw((value) => value + 1)); setSession(owner);
    return () => { stop(); owner.dispose(); };
  }, [grid]);
  return <main style={{ padding: 24 }}><h1>Advanced filtering</h1><p>Build typed conditions, inspect candidates and save a view.</p>
    <DataGrid ariaLabel="Filter records" data={filterRecords} columns={filteringColumns} getRowId={getRowId} onGridReady={setGrid} paginationControls style={{ height: "300px" }} />
    <output aria-label="Matching rows">{grid?.getFilteredRowModel().rows.map((row) => String(row.getValue("name") ?? "")).join(", ")}</output>
    {session && <><div role="group" aria-label="Settings failure scenarios"><button type="button" onClick={session.failStorage}>Simulate storage failure</button><button type="button" onClick={session.restoreStorage}>Restore storage</button><button type="button" onClick={session.failCandidates}>Fail next candidate search</button></div><FilterPanel controller={session.controller} /></>}
  </main>;
}
