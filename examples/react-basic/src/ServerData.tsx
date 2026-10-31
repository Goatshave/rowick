import { useEffect, useState } from "react";
import { ServerDataPanel } from "@rowick/react-ui/server-data";
import { createDatasourceExample, datasourceColumns, getDatasourceChildScope, getDatasourceEvidence, getDatasourceExampleActions, type DatasourceExample } from "@rowick/example-shared-server/datasource-client";
export default function ServerData() {
  const [example, setExample] = useState<DatasourceExample>(), [, redraw] = useState(0);
  useEffect(() => { const session = createDatasourceExample({ download: true }), stop = session.subscribe(() => redraw((value) => value + 1)); setExample(session); void session.start();
    return () => { stop(); session.dispose(); }; }, []);
  return <main style={{ padding: 24, overflowWrap: "anywhere" }}><h1>Server datasource</h1><p>Ten million logical records with bounded blocks, query selection and persistent HTTP recovery.</p>
    {example && <><div role="group" aria-label="Datasource scenarios">{getDatasourceExampleActions(example).map(([label, action]) => <button type="button" key={label} onClick={() => { void action(); }}>{label}</button>)}</div>
      <p role="status" aria-label="Datasource scenario result">{example.getMessage()}</p>
      <output aria-label="Datasource evidence">{getDatasourceEvidence(example)}</output>
      <ServerDataPanel controller={example.source} columns={datasourceColumns} actions={example.actions} getChildScope={getDatasourceChildScope} getRowLabel={(row) => row.name} />
    </>}
  </main>;
}
